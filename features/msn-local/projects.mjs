/** Local draft persistence. No rendering, networking, or publication side effects. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {deliveryBriefSchema} from './article-script.mjs';
import { sceneModelSchema, validateSceneModel } from './scene-renderer.mjs';

const definitions = [
  ['news-article', 'News Article'],
  ['player-club', 'Player & Club'],
  ['transfer', 'Transfer'],
];
const articleDefaults = {
  version: 1, width: 1920, height: 1080, fps: 30,
  title: '', heading: '', subheading: '', status: '', background: '#060d15',
  audio: { asset: '', volume: 1 }, audioLabel: '', srt: '', script: '', sourceUrl: '',
  sourceCheckedAt: null, cutoutAssetId: '', deliveryBrief:null,
  scenes: [], music: { asset: '', start: 0, end: 0, timelineStart: 0, volume: 0.12, fadeIn: 0, fadeOut: 0 },
  burnCaptions: true, captionPreset: 'standard', captionTextColor:'#ffffff', captionHighlightColor:'#00ffff', voice: '', elevenlabsVoiceId: '',
};
const fields = new Set([...Object.keys(articleDefaults), 'metadata']);
const queues = new Map();
const clone = value => structuredClone(value);

// Layout coordinates target the existing 1920 × 1080 landscape canvas.
// Empty asset slots are intentional drafts; no fixture or narration is invented.
function layoutScenes(templateId) {
  const image = (id, x, y, width, height) => ({
    id, type: 'image', text: '', asset: '', x, y, width, height,
  });
  const label = (id, text, x, y, width, height, fontSize, color = '#ffffff') => ({
    id, type: 'text', text, asset: '', x, y, width, height, fontSize, color,
  });
  const brand = () => image('brand-logo', 80, 48, 300, 90);
  const layouts = {
    'news-article': [
      image('article-image', 0, 0, 1920, 690),
      brand(),
      label('headline', 'Article headline', 80, 730, 1760, 140, 64),
      label('summary', 'Add a short summary', 80, 885, 1760, 100, 36, '#00e8f0'),
    ],
    'player-club': [
      image('player-cutout', 60, 180, 900, 850),
      brand(),
      label('headline', 'Player name', 1040, 210, 800, 120, 64),
      label('club-name', 'Club name', 1040, 345, 800, 90, 44, '#00e8f0'),
      image('club-logo', 1230, 480, 420, 420),
    ],
    transfer: [
      image('player-cutout', 60, 190, 850, 840),
      brand(),
      label('story-status', 'Transfer update', 1000, 180, 840, 70, 32, '#00e8f0'),
      label('headline', 'Player name', 1000, 275, 840, 120, 64),
      image('from-club-logo', 1040, 450, 280, 280),
      label('direction', '→', 1360, 520, 120, 120, 80, '#00e8f0'),
      image('to-club-logo', 1520, 450, 280, 280),
      label('summary', 'Add sourced transfer details', 1000, 810, 840, 140, 36),
    ],
  };
  return [{ id: 'scene-1', duration: 8, background: '#060d15', layers: layouts[templateId] }];
}

/** Returns detached reusable defaults; templates never contain project identity. */
export function listTemplates() {
  return definitions.map(([id, name]) => ({ id, name, defaults: {
    ...clone(articleDefaults), title: name, scenes: layoutScenes(id),
    metadata: { description: '', tags: [], sourceUrl: '', language: '', seo: { title: '', description: '', tags: [] } },
  } }));
}

function tags(value) {
  if (!Array.isArray(value) || value.length > 100 || value.some(v => typeof v !== 'string' || v.length > 200)) {
    throw Error('Tags must be an array of up to 100 strings (200 characters each)');
  }
  return [...new Set(value.map(v => v.trim()).filter(Boolean))];
}
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw Error('Expected a plain object');
  }
}
function utc(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function metadata(patch, previous) {
  object(patch);
  const result = clone(previous);
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'tags') result.tags = tags(value);
    else if (['description', 'sourceUrl', 'language'].includes(key) && typeof value === 'string' && value.length <= ({ description: 10000, sourceUrl: 4096, language: 100 }[key])) result[key] = value;
    else if (key === 'seo') {
      object(value);
      for (const [k, v] of Object.entries(value)) {
        if (k === 'tags') result.seo.tags = tags(v);
        else if (['title', 'description'].includes(k) && typeof v === 'string' && v.length <= 10000) result.seo[k] = v;
        else throw Error('Invalid SEO field');
      }
    } else throw Error('Invalid metadata field');
  }
  return result;
}
function text(value, max = 10000) {
  if (typeof value !== 'string' || value.length > max) throw Error('Invalid text value');
}
// Asset references are preserved root-relative, never resolved or fetched here.
function asset(value) {
  text(value, 4096);
  if (/[\x00-\x1f\\]/.test(value) || /^[a-z][a-z\d+.-]*:/i.test(value) || path.isAbsolute(value) || value.split('/').includes('..')) throw Error('Invalid local asset');
}
// Reuse the renderer's field constraints, relaxing only empty draft content.
const draftAsset = z.string().max(4096);
const rendererScene = sceneModelSchema.shape.scenes.element;
const rendererLayers = rendererScene.shape.layers.unwrap().element;
const draftLayers = z.discriminatedUnion('type', rendererLayers.options.map(schema =>
  schema.extend(schema.shape.type.value === 'text'
    ? { text: z.string().max(2000) }
    : { asset: draftAsset })));
const draftScene = rendererScene.extend({
  video: rendererScene.shape.video.unwrap().extend({ asset: draftAsset }).optional(),
  layers: z.array(draftLayers).max(50).default([]),
});
const draftAudio = sceneModelSchema.shape.audio.unwrap().extend({ asset: draftAsset });
const draftMusic = sceneModelSchema.shape.music.unwrap().extend({
  asset: draftAsset, volume: z.number().finite().min(0).max(4).default(0.12),
});
function track(value, music = false) {
  if (value === null) return null;
  const parsed = (music ? draftMusic : draftAudio).parse(value);
  asset(parsed.asset);
  if (music && (parsed.end < parsed.start || parsed.fadeIn + parsed.fadeOut > parsed.end - parsed.start)) throw Error('Invalid music trim or fades');
  if (!music && parsed.start !== undefined && parsed.end !== undefined && parsed.end <= parsed.start) throw Error('Invalid narration trim');
  // A partially entered trim is a draft; paired trims and timeline fit are build gates.
  return parsed;
}
function scenes(value) {
  const parsed = z.array(draftScene).max(100).parse(value);
  const ids = new Set();
  let duration = 0;
  for (const scene of parsed) {
    if (scene.id !== undefined) {
      if (ids.has(scene.id)) throw Error('Scene IDs must be unique');
      ids.add(scene.id);
    }
    duration += scene.duration;
    if (scene.video) asset(scene.video.asset);
    const layerIds = new Set();
    for (const layer of scene.layers) {
      if (layer.id !== undefined) {
        if (layerIds.has(layer.id)) throw Error('Layer IDs must be unique within a scene');
        layerIds.add(layer.id);
      }
      if (layer.asset !== undefined) asset(layer.asset);
    }
  }
  if (duration > 1200) throw Error('Maximum duration is 1200 seconds');
  // Keep optional properties absent instead of materializing renderer defaults.
  return clone(value);
}

/** Final build gate, using exactly the renderer contract (no asset IO/rendering).
 * Draft saves deliberately permit empty assets/text/scenes and unfinished captions.
 * The renderer still checks actual files, duration and supported media at build time.
 */
export function validateProjectForBuild(project) {
  object(project);
  const model = Object.fromEntries(Object.keys(sceneModelSchema.shape)
    .filter(key => project[key] !== undefined).map(key => [key, clone(project[key])]));
  for (const key of ['audio', 'music']) if (model[key] == null || model[key].asset === '') delete model[key];
  if (model.metadata) model.metadata = Object.fromEntries(['description', 'tags', 'sourceUrl', 'language']
    .filter(key => model.metadata[key] !== undefined).map(key => [key, model.metadata[key]]));
  return validateSceneModel(model);
}
function applyPatch(previous, patch) {
  object(patch);
  const result = clone(previous);
  for (const [key, value] of Object.entries(patch)) {
    if (!fields.has(key)) throw Error(`Unsupported project field: ${key}`);
    if (['version', 'width', 'height', 'fps', 'captionPreset', 'captionTextColor', 'captionHighlightColor', 'voice', 'title'].includes(key)) result[key] = sceneModelSchema.shape[key].parse(value);
    else if (key === 'deliveryBrief') result.deliveryBrief=value===null?null:deliveryBriefSchema.parse(value);
    else if (key === 'metadata') result.metadata = metadata(value, result.metadata);
    else if (key === 'scenes') result.scenes = scenes(value);
    else if (key === 'audio' || key === 'music') result[key] = track(value, key === 'music');
    else if (key === 'burnCaptions') {
      if (typeof value !== 'boolean') throw Error('Invalid burnCaptions');
      result[key] = value;
    } else if (key === 'sourceCheckedAt') {
      if (value !== null && !utc(value)) throw Error('sourceCheckedAt must be an ISO 8601 UTC timestamp or null');
      result[key] = value;
    } else {
      if (typeof value !== 'string' || value.length > (['srt', 'script'].includes(key) ? 200000 : 10000)) throw Error(`Invalid ${key}`);
      if (['title', 'heading', 'subheading', 'status'].includes(key) && value.length > 100) throw Error(`${key} exceeds 100 characters`);
      if (key === 'background' && !/^#[0-9a-f]{6}$/i.test(value)) throw Error('Invalid background colour');
      result[key] = value;
    }
  }
  for (const scene of result.scenes) {
    if (Math.abs(scene.duration * result.fps - Math.round(scene.duration * result.fps)) > 1e-6) throw Error('Scene duration must be a whole number of frames');
    for (const layer of scene.layers ?? []) {
      if (layer.x >= result.width || layer.y >= result.height) throw Error('Layer origin is outside the canvas');
    }
  }
  return result;
}

/**
 * Stores all drafts in <directory>/projects.json. Calls across store instances
 * serialize in this process. Other processes receive a busy error while locked.
 * A crashed writer may leave projects.lock: inspect it before manually removing.
 * The temp file is flushed then renamed on the same filesystem (commit point).
 */
export function createProjectStore(directory, { now = () => new Date(), persistence = undefined } = {}) {
  if (typeof directory !== 'string' || !directory) throw Error('A local storage directory is required');
  const root = path.resolve(directory);
  async function read(file) {
    let data;
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { version: 1, projects: [], templates: [] }; throw error; }
    return validateData(data);
  }
  function validateData(data) {
    if (data.version !== 1 || !Array.isArray(data.projects)) throw Error('Invalid project store');
    data.templates ??= [];
    if (!Array.isArray(data.templates)) throw Error('Invalid templates');
    const templateIds = new Set(definitions.map(([id]) => id));
    for (const t of data.templates) {
      object(t);
      if (typeof t.id !== 'string' || !t.id || templateIds.has(t.id) || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 100 || !utc(t.createdAt) || !utc(t.updatedAt)) throw Error('Invalid saved template');
      templateIds.add(t.id);
      t.defaults = applyPatch(listTemplates()[0].defaults, t.defaults);
    }
    const ids = new Set();
    for (const p of data.projects) {
      object(p);
      if (typeof p.id !== 'string' || !p.id || ids.has(p.id) || !templateIds.has(p.templateId) ||
          !utc(p.createdAt) || !utc(p.updatedAt) || (p.trashedAt !== null && !utc(p.trashedAt))) throw Error('Invalid saved project');
      ids.add(p.id);
      const { id, templateId, createdAt, updatedAt, trashedAt, ...content } = p;
      if (typeof content.title !== 'string') throw Error('Incomplete saved project');
      // Upgrade earlier article drafts in memory; reads never change disk timestamps.
      if (typeof content.audio === 'string') content.audio = { asset: content.audio, volume: 1 };
      Object.assign(p, applyPatch({ ...listTemplates()[0].defaults, scenes: [] }, content));
    }
    return data;
  }
  async function operation(change) {
    if (persistence) {
      if (!change) return validateData(await persistence.read());
      return persistence.update(data => {
        validateData(data);
        const result = change(data.projects, new Date(now()).toISOString(), data);
        return clone(result);
      });
    }
    await fs.mkdir(root, { recursive: true });
    const canonical = await fs.realpath(root);
    const file = path.join(canonical, 'projects.json');
    const previous = queues.get(file) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      if (!change) return read(file);
      const lockPath = path.join(canonical, 'projects.lock');
      let lock;
      try { lock = await fs.open(lockPath, 'wx', 0o600); }
      catch (error) { if (error.code === 'EEXIST') throw Error('Project store is busy (projects.lock exists)'); throw error; }
      const temp = path.join(canonical, `.projects-${randomUUID()}.tmp`);
      try {
        const data = await read(file);
        const stamp = new Date(now()).toISOString();
        const result = change(data.projects, stamp, data);
        const handle = await fs.open(temp, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify(data, null, 2) + '\n'); await handle.sync(); }
        finally { await handle.close(); }
        await fs.rename(temp, file);
        return clone(result);
      } finally {
        // Cleanup must not turn a committed rename into a reported failed save.
        await fs.rm(temp, { force: true }).catch(() => {});
        await lock.close().catch(() => {});
        await fs.unlink(lockPath).catch(() => {});
      }
    });
    queues.set(file, pending);
    try { return await pending; }
    finally { if (queues.get(file) === pending) queues.delete(file); }
  }
  function find(projects, id) {
    const p = projects.find(p => p.id === id);
    if (!p) throw Error('Project not found');
    return p;
  }
  return {
    async listTemplates() { return [...listTemplates(), ...(await operation()).templates]; },
    async list({ trash = false } = {}) {
      return (await operation()).projects.filter(p => Boolean(p.trashedAt) === trash);
    },
    async get(id) { return find((await operation()).projects, id); },
    async create(templateId, patch = {}) {
      object(patch);
      const snapshot = clone(patch);
      return operation((projects, stamp, data) => {
        const template = [...listTemplates(), ...data.templates].find(t => t.id === templateId);
        if (!template) throw Error('Unknown template');
        const content = applyPatch(template.defaults, snapshot);
        const p = { ...content, id: randomUUID(), templateId, createdAt: stamp, updatedAt: stamp, trashedAt: null };
        projects.push(p);
        return p;
      });
    },
    async saveTemplate({ projectId, name }) {
      text(name, 100);
      if (!name.trim()) throw Error('Template name is required');
      return operation((projects, stamp, data) => {
        const project = find(projects, projectId);
        if (project.trashedAt) throw Error('Restore the project before saving a template');
        const { id, templateId, createdAt, updatedAt, trashedAt, ...defaults } = project;
        const template = { id: `custom-${randomUUID()}`, name: name.trim(), defaults: clone(defaults), createdAt: stamp, updatedAt: stamp };
        data.templates.push(template);
        return template;
      });
    },
    async save(id, patch, expectedUpdatedAt) {
      // Capture input at invocation so callers cannot change queued saves.
      object(patch);
      const snapshot = clone(patch);
      return operation((projects, stamp) => {
        const old = find(projects, id);
        if (expectedUpdatedAt !== undefined && old.updatedAt !== expectedUpdatedAt) throw Error('Project changed while narration was generated. Audio is retained in Library; reload before attaching it.');
        if (old.trashedAt) throw Error('Restore the project before saving');
        const p = applyPatch(old, snapshot);
        p.updatedAt = stamp;
        projects[projects.indexOf(old)] = p;
        return p;
      });
    },
    trash(id) { return operation((projects, stamp) => {
      const p = find(projects, id);
      if (p.trashedAt) throw Error('Project is already trashed');
      p.updatedAt = stamp; p.trashedAt = p.updatedAt;
      return p;
    }); },
    restore(id) { return operation((projects, stamp) => {
      const p = find(projects, id);
      if (!p.trashedAt) throw Error('Project is not trashed');
      p.updatedAt = stamp; p.trashedAt = null;
      return p;
    }); },
  };
}
