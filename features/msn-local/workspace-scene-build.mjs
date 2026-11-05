import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {renderScenes} from './scene-renderer.mjs';

/** Leave about four minutes of the 15-minute worker for the scene already started. */
export const SCENE_WORKER_BUDGET_MS = 11 * 60 * 1000;
const SCENE_ATTEMPTS = 3;

export function sceneChecksum(model, index) {
  const scene = model.scenes[index];
  return createHash('sha256').update(JSON.stringify({
    width: model.width, height: model.height, fps: model.fps, scene,
    burnCaptions: !!model.burnCaptions, captionPreset: model.captionPreset || '',
    captionTextColor: model.captionTextColor || '', captionHighlightColor: model.captionHighlightColor || '',
    srt: model.srt || '',
  })).digest('hex');
}

function assemblyChecksum(model, checksums) {
  return createHash('sha256').update(JSON.stringify({ checksums, audio: model.audio || null, music: model.music || null })).digest('hex');
}

function errorText(error) {
  return String(error instanceof Error ? error.message : 'Scene failed').slice(0, 500);
}

function progressOf(render) {
  const total = render.scenes.length + 1;
  const done = render.scenes.filter(scene => scene.status === 'complete').length;
  return Math.min(99, Math.round(done / total * 100));
}

function alignPlan(job, model, previous) {
  const restart = job.request?.restart === true;
  const prior = restart ? [] : [...(job.render?.scenes || []), ...previous.flatMap(item => item.render?.scenes || [])];
  const scenes = model.scenes.map((scene, index) => {
    const checksum = sceneChecksum(model, index);
    const keep = prior.find(item => item.checksum === checksum && item.status === 'complete' && item.asset);
    if (keep) return { index, id: scene.id || String(index), status: 'complete', checksum, asset: keep.asset, sha256: keep.sha256 || '', bytes: keep.bytes || 0, attempts: 0, error: '', startedAt: keep.startedAt || '', completedAt: keep.completedAt || '', durationMs: keep.durationMs || 0 };
    const same = job.render?.scenes?.find(item => item.index === index && item.checksum === checksum);
    return { index, id: scene.id || String(index), status: same?.status === 'failed' ? 'failed' : 'pending', checksum, asset: '', sha256: '', bytes: 0, attempts: same?.attempts || 0, error: same?.error || '', durationMs: 0, startedAt: '', completedAt: '' };
  });
  for (const scene of scenes) if (scene.status === 'rendering') scene.status = 'pending';
  const checksums = scenes.map(scene => scene.checksum);
  const checksum = assemblyChecksum(model, checksums);
  const previousAssembly = !restart && job.render?.assembly?.checksum === checksum ? job.render.assembly : null;
  const assembly = { status: previousAssembly?.status === 'complete' ? 'complete' : 'pending', checksum, asset: previousAssembly?.asset || '', attempts: previousAssembly?.attempts || 0, error: previousAssembly?.error || '' };
  if (assembly.status === 'rendering') assembly.status = 'pending';
  const samples = restart ? [] : (job.render?.samples || []);
  job.render = { version: 1, scenes, assembly, samples: samples.length ? samples : scenes.filter(scene => scene.durationMs > 0).map(scene => scene.durationMs) };
}

/**
 * Render one scene at a time into durable storage. A pass that is near the
 * worker limit returns {yielded:true} with completed scenes kept. The caller
 * requeues the same job; it does not start the programme again.
 */
export async function renderPersistedScenes(workspace, job, model, { root, signal, budgetMs = SCENE_WORKER_BUDGET_MS, continueBuild, passStarted = Date.now() } = {}) {
  const previous = (await workspace.snapshot()).state.jobs.filter(item => item.id !== job.id && item.request?.projectId === job.request?.projectId);
  alignPlan(job, model, previous);
  const local = new Map();
  async function updateJob(change) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { return await workspace.update(change); }
      catch (error) { if (attempt === 3 || !String(error.message).includes('Another editor')) throw error; }
    }
  }
  async function materialise(record) {
    if (local.has(record.index)) return local.get(record.index);
    if (record.status !== 'complete' || !record.asset) return null;
    try {
      const { entry, bytes } = await workspace.getFile(record.asset);
      if (record.sha256 && entry.sha256 !== record.sha256) throw Error('Stored scene did not match its checksum');
      const file = path.join(root, `kept-scene-${record.index}.mp4`);
      await fs.writeFile(file, bytes);
      local.set(record.index, file);
      return file;
    } catch {
      record.status = 'pending';
      record.asset = '';
      record.sha256 = '';
      record.bytes = 0;
      record.completedAt = '';
      local.delete(record.index);
      return null;
    }
  }
  for (const scene of job.render.scenes) if (scene.status === 'complete') await materialise(scene);
  const done = () => job.render.scenes.filter(scene => scene.status === 'complete').length;
  async function persist(stage, patch) {
    await updateJob(state => {
      const current = state.jobs.find(item => item.id === job.id);
      if (!current) throw Error('Build not found');
      if (current.cancelRequestedAt) { const abort = Error('Cancelled'); abort.name = 'AbortError'; throw abort; }
      if (patch?.status === undefined && current.status !== 'running') throw Error('Build is no longer active');
      Object.assign(current, patch, { render: job.render, stage, progress: progressOf(job.render), updatedAt: new Date().toISOString() });
      return true;
    });
  }
  async function release(status, stage) {
    await updateJob(state => {
      const current = state.jobs.find(item => item.id === job.id);
      if (!current) throw Error('Build not found');
      if (current.cancelRequestedAt) { current.status = 'cancelled'; current.stage = 'Cancelled. Completed scenes are saved.'; current.render = job.render; current.updatedAt = new Date().toISOString(); return true; }
      current.status = status;
      current.stage = stage;
      current.progress = progressOf(job.render);
      current.render = job.render;
      current.updatedAt = new Date().toISOString();
      if (status === 'queued') current.queuedAt = current.updatedAt;
      delete current.startedAt;
      return true;
    });
  }
  const outOfTime = () => Date.now() - passStarted >= budgetMs;
  let finishedThisPass = 0;
  await persist(`Saved ${done()} of ${job.render.scenes.length} scenes.`);
  while (job.render.scenes.some(scene => scene.status !== 'complete')) {
    if (signal?.aborted) throw Object.assign(Error('Cancelled'), { name: 'AbortError' });
    const live = (await workspace.snapshot()).state.jobs.find(item => item.id === job.id);
    if (live?.cancelRequestedAt) throw Object.assign(Error('Cancelled'), { name: 'AbortError' });
    if (live?.pauseRequestedAt) {
      await release('paused', `Paused after ${done()} of ${job.render.scenes.length} scenes.`);
      return { paused: true };
    }
    const next = job.render.scenes.find(scene => scene.status === 'pending' || (scene.status === 'failed' && scene.attempts < SCENE_ATTEMPTS));
    if (!next) {
      const blocked = job.render.scenes.find(scene => scene.status === 'failed');
      throw Error(blocked ? `Scene ${blocked.index + 1} failed: ${blocked.error || 'Scene failed'}` : 'A scene could not be rendered');
    }
    if (outOfTime() && finishedThisPass > 0) {
      await release('queued', `Saved ${done()} of ${job.render.scenes.length} scenes. Continuing.`);
      if (continueBuild) { try { await continueBuild(job.id); } catch { /* The open project retries a queued build. */ } }
      return { yielded: true };
    }
    const started = Date.now();
    next.status = 'rendering';
    next.attempts += 1;
    next.error = '';
    next.startedAt = new Date().toISOString();
    await persist(`Rendering scene ${next.index + 1} of ${job.render.scenes.length}`);
    try {
      const outputFile = path.join(root, `encoded-scene-${next.index}.mp4`);
      await renderScenes(model, { onlyIndex: next.index, outputFile, root, assetBoundary: root, signal, onProgress: () => {} });
      const bytes = await fs.readFile(outputFile);
      const asset = `renders/${job.id}/scene-${next.index}.mp4`;
      const entry = await workspace.putBytes(asset, bytes, { name: `Scene ${next.index + 1}`, updatedAt: new Date().toISOString() });
      next.status = 'complete';
      next.asset = asset;
      next.sha256 = entry.sha256;
      next.bytes = entry.bytes;
      next.completedAt = new Date().toISOString();
      next.durationMs = Date.now() - started;
      next.error = '';
      job.render.samples = [...job.render.samples, next.durationMs].slice(-40);
      local.set(next.index, outputFile);
      finishedThisPass += 1;
      await updateJob(state => {
        const current = state.jobs.find(item => item.id === job.id);
        if (!current || current.status !== 'running') throw Error('Build is no longer active');
        state.assets[asset] = entry;
        current.render = job.render;
        current.stage = `Saved scene ${next.index + 1} of ${job.render.scenes.length}`;
        current.progress = progressOf(job.render);
        current.updatedAt = new Date().toISOString();
        return true;
      });
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') {
        next.status = 'pending';
        next.attempts = Math.max(0, next.attempts - 1);
        await persist(`Saved ${done()} of ${job.render.scenes.length} scenes.`, {}).catch(() => {});
        throw error;
      }
      next.status = 'failed';
      next.error = errorText(error);
      await persist(`Scene ${next.index + 1} failed. ${next.attempts < SCENE_ATTEMPTS ? 'Retrying.' : next.error}`);
      if (next.attempts >= SCENE_ATTEMPTS) throw Error(`Scene ${next.index + 1} failed: ${next.error}`);
    }
  }
  if (outOfTime() && finishedThisPass > 0) {
    await release('queued', `Saved ${done()} of ${job.render.scenes.length} scenes. Continuing.`);
    if (continueBuild) { try { await continueBuild(job.id); } catch { /* The open project retries a queued build. */ } }
    return { yielded: true };
  }
  if (job.render.assembly.status === 'complete' && job.render.assembly.asset) {
    try {
      const { bytes } = await workspace.getFile(job.render.assembly.asset);
      const file = path.join(root, 'assembled.mp4');
      await fs.writeFile(file, bytes);
      return { output: { file, title: model.title, expectedDuration: model.scenes.reduce((sum, scene) => sum + scene.duration, 0), narration: Boolean(model.audio), music: Boolean(model.music), width: model.width, height: model.height, audio: true, duration: model.scenes.reduce((sum, scene) => sum + scene.duration, 0), updatedAt: new Date().toISOString(), metadata: model.metadata || {}, voice: null, requestedVoice: model.audio ? (model.voice ?? null) : null, voiceProvenance: model.audio ? 'unverified' : 'not-applicable' } };
    } catch { job.render.assembly.status = 'pending'; job.render.assembly.asset = ''; }
  }
  while (job.render.assembly.status !== 'complete') {
    if (signal?.aborted) throw Object.assign(Error('Cancelled'), { name: 'AbortError' });
    job.render.assembly.status = 'rendering';
    job.render.assembly.attempts += 1;
    job.render.assembly.error = '';
    await persist('Joining scenes and checking audio');
    try {
      const files = [];
      for (const scene of job.render.scenes) {
        const file = local.get(scene.index) || await materialise(scene);
        if (!file) throw Error(`Scene ${scene.index + 1} is missing`);
        files.push(file);
      }
      const output = await renderScenes(model, { sceneFiles: files, root, assetBoundary: root, signal, onProgress: () => {} });
      job.render.assembly.status = 'pending';
      await persist('Joined scenes. Saving the video.');
      return { output };
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      job.render.assembly.status = 'failed';
      job.render.assembly.error = errorText(error);
      await persist(`Final assembly failed. ${job.render.assembly.error}`);
      if (job.render.assembly.attempts >= SCENE_ATTEMPTS) throw Error(`Final assembly failed: ${job.render.assembly.error}`);
      if (outOfTime()) {
        await release('queued', `Saved ${done()} of ${job.render.scenes.length} scenes. Continuing.`);
        if (continueBuild) { try { await continueBuild(job.id); } catch { /* The open project retries a queued build. */ } }
        return { yielded: true };
      }
    }
  }
  throw Error('The finished scenes could not be joined');
}
