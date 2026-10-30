import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { ASSET_ROOT, validateSceneModel, renderStudio } from './scene-renderer.mjs';
import { run } from './engine.mjs';
import { createProjectStore, listTemplates, validateProjectForBuild } from './projects.mjs';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'msn-projects-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let time = '2026-10-28T10:00:00.000Z';
  const store = createProjectStore(dir, { now: () => time });
  return { dir, store, tick: () => { time = '2026-10-28T11:00:00.000Z'; } };
}

test('three reusable templates create independent drafts compatible with article fields', async t => {
  const { store, dir } = await fixture(t);
  assert.deepEqual(listTemplates().map(t => t.name), ['News Article', 'MSN Video → Football365 → LIVE Studio Broadcast', 'Player & Club', 'Transfer']);
  const defaults = listTemplates(); defaults[0].defaults.metadata.tags.push('changed');
  assert.deepEqual(listTemplates()[0].defaults.metadata.tags, []);
  const a = await store.create('player-club', { title: 'First', metadata: { tags: ['football'] } });
  const b = await store.create('player-club');
  assert.notEqual(a.id, b.id);
  assert.deepEqual(b.audio, { asset: '', volume: 1 }); assert.equal(b.srt, '');
  a.metadata.tags.push('external');
  await store.save(a.id, { heading: 'Updated' });
  assert.equal((await store.get(b.id)).heading, '');
  assert.deepEqual((await store.get(a.id)).metadata.tags, ['football']);
  assert.equal((await createProjectStore(dir).get(a.id)).heading, 'Updated');
  for (const id of ['news-article', 'transfer']) assert.equal((await store.create(id)).templateId, id);
});

test('metadata and SEO round trip; only successful mutations change timestamps', async t => {
  const { store, dir, tick } = await fixture(t);
  const verified = '2025-01-01T00:00:00.000Z';
  const p = await store.create('news-article', { sourceCheckedAt: verified, metadata: {
    description: 'Story', tags: [' sport ', 'sport'], seo: { title: 'Search title', description: 'Search description', tags: ['news'] },
  } });
  tick();
  assert.deepEqual(await store.get(p.id), p);
  await store.list();
  const bytes = await fs.readFile(path.join(dir, 'projects.json'), 'utf8');
  for (const patch of [{ updatedAt: verified }, { background: 'red' }, { metadata: { seo: { tags: 'bad' } } }, { sourceCheckedAt: 'today' }]) {
    await assert.rejects(store.save(p.id, patch));
  }
  await assert.rejects(store.create('missing'));
  assert.equal(await fs.readFile(path.join(dir, 'projects.json'), 'utf8'), bytes);
  const saved = await store.save(p.id, { metadata: { seo: { title: 'New title' } }, script: 'Narration' });
  assert.equal(saved.createdAt, p.createdAt);
  assert.equal(saved.updatedAt, '2026-10-28T11:00:00.000Z');
  assert.equal(saved.sourceCheckedAt, verified);
  assert.deepEqual(saved.metadata, { description: 'Story', tags: ['sport'], sourceUrl: '', language: '', seo: { title: 'New title', description: 'Search description', tags: ['news'] } });
});

test('trash hides drafts without deleting content; restore retains identity', async t => {
  const { store, tick } = await fixture(t);
  const p = await store.create('transfer', { title: 'Transfer story', srt: 'unfinished draft' });
  tick();
  const deleted = await store.trash(p.id);
  assert.equal(deleted.trashedAt, deleted.updatedAt);
  assert.deepEqual(await store.list(), []);
  assert.equal((await store.list({ trash: true }))[0].id, p.id);
  await assert.rejects(store.save(p.id, { title: 'No' }), /Restore/);
  await assert.rejects(store.trash(p.id), /already/);
  const restored = await store.restore(p.id);
  assert.equal(restored.id, p.id); assert.equal(restored.srt, p.srt);
  assert.equal(restored.createdAt, p.createdAt); assert.equal(restored.trashedAt, null);
  assert.equal((await store.list()).length, 1);
  await assert.rejects(store.restore(p.id), /not trashed/);
  await assert.rejects(store.get('../unknown'), /not found/);
});

test('concurrent store instances serialize writes without losing projects or patch fields', async t => {
  const { store, dir } = await fixture(t);
  const second = createProjectStore(dir);
  const all = await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? store : second).create('news-article', { title: String(i) })));
  assert.equal((await store.list()).length, 30);
  const patch = { metadata: { seo: { tags: ['captured'] } } };
  const queued = store.save(all[0].id, patch);
  patch.metadata.seo.tags.push('late mutation');
  await Promise.all([queued, second.save(all[0].id, { heading: 'Concurrent' }), store.save(all[0].id, { subheading: 'Also saved' })]);
  const saved = await second.get(all[0].id);
  assert.equal(saved.heading, 'Concurrent'); assert.equal(saved.subheading, 'Also saved');
  assert.deepEqual(saved.metadata.seo.tags, ['captured']);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['projects.json']);
});

test('competing process lock fails safely and a later save recovers', async t => {
  const { store, dir, tick } = await fixture(t);
  const p = await store.create('news-article'); tick();
  const lock = path.join(dir, 'projects.lock');
  await fs.writeFile(lock, 'other writer', { flag: 'wx' });
  await assert.rejects(store.save(p.id, { title: 'Blocked' }), /busy/);
  assert.deepEqual(await store.get(p.id), p);
  assert.equal(await fs.readFile(lock, 'utf8'), 'other writer');
  await fs.unlink(lock);
  assert.equal((await store.save(p.id, { title: 'Recovered' })).title, 'Recovered');
});

test('failed atomic rename preserves saved bytes and timestamps and does not poison the queue', async t => {
  const { store, dir, tick } = await fixture(t);
  const p = await store.create('transfer'); tick();
  const before = await fs.readFile(path.join(dir, 'projects.json'), 'utf8');
  const rename = t.mock.method(fs, 'rename', async () => { throw Object.assign(Error('Disk error'), { code: 'EIO' }); });
  await assert.rejects(store.save(p.id, { title: 'Uncommitted' }), /Disk error/);
  rename.mock.restore();
  assert.equal(await fs.readFile(path.join(dir, 'projects.json'), 'utf8'), before);
  assert.deepEqual(await store.get(p.id), p);
  assert.deepEqual(await fs.readdir(dir), ['projects.json']);
  assert.equal((await store.save(p.id, { title: 'Recovered' })).title, 'Recovered');
});

test('corrupt or unsupported disk data is never silently overwritten', async t => {
  const { store, dir } = await fixture(t);
  for (const invalid of ['{broken', '{"version":2,"projects":[]}', '{"version":1,"projects":[{}]}']) {
    await fs.writeFile(path.join(dir, 'projects.json'), invalid);
    await assert.rejects(store.create('news-article'));
    assert.equal(await fs.readFile(path.join(dir, 'projects.json'), 'utf8'), invalid);
    assert.deepEqual(await fs.readdir(dir), ['projects.json']);
  }
});

const flatDocument = {
  scenes: [{ id: 'scene-1', duration: 8, background: '#060d15', layers: [
    { id: 'headline', type: 'text', text: 'Story headline', asset: '', x: 40, y: 40, width: 800, height: 160, fontSize: 48, color: '#ffffff' },
    { id: 'photo', type: 'image', text: '', asset: 'projects/mac-allister/cutout.png', x: 100, y: 200, width: 700, height: 800 },
  ] }],
  audio: { asset: 'projects/mac-allister/sam.wav', volume: 0.8 },
  music: { asset: 'music/bed.mp3', start: 2, end: 10, timelineStart: 0, volume: 0.2, fadeIn: 1, fadeOut: 2 },
  srt: '1\n00:00:00,000 --> 00:00:02,000\nStory headline',
  burnCaptions: true, captionPreset: 'bold', voice: 'Sam',
  metadata: { description: 'Story description', tags: ['football'], sourceUrl: 'https://example.org/story', language: 'en' },
};

test('flat scene document and root-relative references survive save and reload', async t => {
  const { store, dir } = await fixture(t);
  const p = await store.create('player-club', flatDocument);
  const read = await createProjectStore(dir).get(p.id);
  for (const key of Object.keys(flatDocument)) {
    if (key === 'metadata') for (const k of Object.keys(flatDocument.metadata)) assert.deepEqual(read.metadata[k], flatDocument.metadata[k]);
    else assert.deepEqual(read[key], flatDocument[key]);
  }
  assert.equal(read.project, undefined);
  assert.equal(read.audio.asset, 'projects/mac-allister/sam.wav');
  read.scenes[0].layers[0].text = 'Changed';
  const changed = await store.save(p.id, { scenes: read.scenes, audio: { asset: '', volume: 1 }, voice: '' });
  assert.equal(changed.scenes[0].layers[0].text, 'Changed');
  assert.deepEqual(changed.audio, { asset: '', volume: 1 });
  assert.equal(changed.voice, '');
});

test('custom templates persist reusable snapshots with independent nested instances', async t => {
  const { store, dir, tick } = await fixture(t);
  const p = await store.create('transfer', flatDocument);
  tick();
  const template = await store.saveTemplate({ projectId: p.id, name: ' My layout ' });
  assert.equal(template.name, 'My layout');
  assert.equal(template.createdAt, '2026-10-28T11:00:00.000Z');
  assert.equal(template.defaults.id, undefined);
  assert.equal(template.defaults.updatedAt, undefined);
  assert.deepEqual(await store.get(p.id), p);
  const reopened = createProjectStore(dir);
  assert.equal((await reopened.listTemplates()).length, 5);
  template.defaults.scenes[0].layers[0].text = 'External change';
  const a = await reopened.create(template.id, { title: 'A' });
  const b = await reopened.create(template.id, { title: 'B' });
  assert.notEqual(a.id, b.id);
  a.scenes[0].layers[0].text = 'A only';
  await store.save(a.id, { scenes: a.scenes });
  await store.save(p.id, { scenes: [] });
  assert.deepEqual((await store.get(b.id)).scenes, flatDocument.scenes);
  assert.deepEqual((await store.listTemplates()).at(-1).defaults.scenes, flatDocument.scenes);
  await store.trash(p.id);
  await assert.rejects(store.saveTemplate({ projectId: p.id, name: 'Trashed' }), /Restore/);
  await assert.rejects(store.saveTemplate({ projectId: b.id, name: ' ' }), /required/);
});

test('invalid scenes, tracks and template write failures leave saved state intact', async t => {
  const { store, dir } = await fixture(t);
  const p = await store.create('news-article', flatDocument);
  const before = await fs.readFile(path.join(dir, 'projects.json'), 'utf8');
  for (const patch of [
    { scenes: [{ ...flatDocument.scenes[0], duration: NaN }] },
    { scenes: [flatDocument.scenes[0], flatDocument.scenes[0]] },
    { scenes: [{ ...flatDocument.scenes[0], layers: [{ ...flatDocument.scenes[0].layers[0], type: 'script' }] }] },
    { audio: { asset: '../escape.wav', volume: 1 } },
    { audio: { asset: 'https://example.org/audio.wav', volume: 1 } },
    { music: { ...flatDocument.music, end: 1 } },
    { music: { ...flatDocument.music, fadeOut: 50 } },
    { burnCaptions: 'true' },
  ]) await assert.rejects(store.save(p.id, patch));
  const rename = t.mock.method(fs, 'rename', async () => { throw Error('Disk error'); });
  await assert.rejects(store.saveTemplate({ projectId: p.id, name: 'Failed template' }), /Disk error/);
  rename.mock.restore();
  assert.equal((await store.listTemplates()).length, 4);
  assert.equal(await fs.readFile(path.join(dir, 'projects.json'), 'utf8'), before);
  assert.deepEqual(await fs.readdir(dir), ['projects.json']);
});

test('legacy article drafts load as flat documents without advancing timestamps or writing on reads', async t => {
  const { store, dir } = await fixture(t);
  const p = await store.create('news-article');
  const legacy = { ...p, audio: 'projects/example/narration.wav' };
  for (const key of ['scenes', 'music', 'burnCaptions', 'captionPreset', 'voice']) delete legacy[key];
  const bytes = JSON.stringify({ version: 1, projects: [legacy] });
  await fs.writeFile(path.join(dir, 'projects.json'), bytes);
  const restored = await store.get(p.id);
  assert.deepEqual(restored.audio, { asset: legacy.audio, volume: 1 });
  assert.equal(restored.updatedAt, p.updatedAt);
  assert.deepEqual(restored.scenes, []);
  assert.equal(await fs.readFile(path.join(dir, 'projects.json'), 'utf8'), bytes);
});

test('built-in layouts have distinct editable scenes and match the server API', async t => {
  const { store } = await fixture(t);
  const templates = await store.listTemplates();
  const expected = {
    'news-article': ['article-image', 'headline', 'summary'],
    'football365-live-studio-broadcast': ['article-image', 'headline', 'summary'],
    'player-club': ['player-cutout', 'club-logo', 'club-name'],
    transfer: ['player-cutout', 'from-club-logo', 'to-club-logo', 'direction'],
  };
  for (const template of templates) {
    const p = await store.create(template.id, { title: `My ${template.name}` });
    assert.equal(p.title, `My ${template.name}`);
    assert.deepEqual(p.scenes, template.defaults.scenes);
    assert.equal(p.scenes.length, 1);
    assert.equal(p.scenes[0].duration, 8);
    const layers = p.scenes[0].layers;
    for (const id of expected[template.id]) assert(layers.some(layer => layer.id === id));
    for (const layer of layers) {
      assert(layer.x >= 0 && layer.y >= 0);
      assert(layer.x + layer.width <= 1920);
      assert(layer.y + layer.height <= 1080);
      if (layer.type === 'image') assert.equal(layer.asset, '');
    }
    assert.equal(p.audio.asset, ''); assert.equal(p.music.asset, '');
    assert.equal(p.voice, ''); assert.equal(p.srt, '');
    const saved = await store.save(p.id, { title: 'Edited title' });
    assert.equal((await store.get(p.id)).title, saved.title);
    const custom = await store.saveTemplate({ projectId: p.id, name: 'Reusable layout' });
    assert.deepEqual(custom.defaults.scenes, p.scenes);
    assert((await store.listTemplates()).some(t => t.id === custom.id));
    p.scenes[0].layers[0].asset = 'images/changed.png';
    await store.save(p.id, { scenes: p.scenes });
    assert.equal((await store.create(template.id, { title: 'Independent' })).scenes[0].layers[0].asset, '');
  }
  assert.equal((await store.list({ trash: false })).length, 8);
  assert.deepEqual(await store.list({ trash: true }), []);
});

test('music defaults to .12 and persists a validated timelineStart with legacy compatibility', async t => {
  const { store, dir } = await fixture(t);
  for (const template of await store.listTemplates()) {
    assert.equal(template.defaults.music.volume, 0.12);
    assert.equal(template.defaults.music.timelineStart, 0);
  }
  const p = await store.create('news-article');
  assert.equal(p.music.volume, 0.12);
  assert.equal(p.music.timelineStart, 0);
  const saved = await store.save(p.id, { music: { ...flatDocument.music, timelineStart: 3.5 } });
  assert.deepEqual((await createProjectStore(dir).get(p.id)).music, saved.music);
  const template = await store.saveTemplate({ projectId: p.id, name: 'Offset music' });
  assert.equal((await store.create(template.id)).music.timelineStart, 3.5);
  for (const timelineStart of [-1, NaN, Infinity, '2', 1201]) {
    await assert.rejects(store.save(p.id, { music: { ...saved.music, timelineStart } }));
  }
  const { timelineStart, ...legacyMusic } = saved.music;
  const legacy = await store.save(p.id, { music: legacyMusic });
  assert.equal(legacy.music.timelineStart, 0);
  assert.equal(legacy.music.volume, saved.music.volume);
  const { volume, ...withoutVolume } = legacyMusic;
  assert.equal((await store.save(p.id, { music: withoutVolume })).music.volume, 0.12);
});

test('draft bounds match renderer fields and rejected saves preserve disk', async t => {
  const { store, dir } = await fixture(t);
  const p = await store.create('news-article', flatDocument);
  const before = await fs.readFile(path.join(dir, 'projects.json'), 'utf8');
  const scene = flatDocument.scenes[0], layer = scene.layers[0];
  const withLayer = patch => ({ scenes: [{ ...scene, layers: [{ ...layer, ...patch }] }] });
  const invalid = [
    withLayer({ x: -1 }), withLayer({ x: 0.5 }), withLayer({ y: 1080 }),
    withLayer({ width: 4097 }), withLayer({ height: 0 }), withLayer({ fontSize: 7 }),
    withLayer({ fontSize: 301 }), withLayer({ fontSize: 12.5 }),
    withLayer({ fontFamily: 'Arial; bad' }), withLayer({ text: 'x'.repeat(2001) }),
    { scenes: [{ ...scene, layers: [{ ...scene.layers[1], fit: 'stretch' }] }] },
    { scenes: [{ ...scene, layers: Array.from({ length: 51 }, (_, i) => ({ ...layer, id: String(i) })) }] },
    { scenes: [{ ...scene, duration: 0.1 }] }, { scenes: [{ ...scene, duration: 0.21 }] },
    { scenes: [{ ...scene, video: { asset: '/outside.mp4', start: 0 } }] },
    { scenes: [{ ...scene, video: { asset: 'clip.mp4', start: -1 } }] },
    { width: 1919 }, { height: 4000 }, { fps: 61 }, { captionPreset: 'unknown' },
    { audio: { asset: 'voice.wav', start: -1, end: 1 } },
    { audio: { asset: 'voice.wav', start: 2, end: 1 } },
    { metadata: { language: 'x'.repeat(101) } }, { voice: 'x'.repeat(201) },
  ];
  for (const patch of invalid) await assert.rejects(store.save(p.id, patch));
  assert.equal(await fs.readFile(path.join(dir, 'projects.json'), 'utf8'), before);
  const fifty = await store.save(p.id, { scenes: [{ ...scene, layers: Array.from({ length: 50 }, (_, i) => ({ ...layer, id: String(i) })) }] });
  assert.equal(validateProjectForBuild(fifty).scenes[0].layers.length, 50);
});

test('incomplete drafts persist but full build validation uses shared renderer gates', async t => {
  const { store } = await fixture(t);
  const p = await store.create('player-club');
  assert.throws(() => validateProjectForBuild(p)); // Blank image slots.
  const draft = await store.save(p.id, {
    scenes: [{ duration: 1, layers: [{ type: 'text', text: '', x: 0, y: 0, fontSize: 20 }] }],
    audio: { asset: 'voice.wav', start: 0 }, srt: 'unfinished', burnCaptions: true,
  });
  assert.throws(() => validateProjectForBuild(draft));
  const complete = await store.save(p.id, {
    scenes: [{ duration: 1, layers: [{ type: 'text', text: 'Ready', x: 0, y: 0, fontSize: 20 }] }],
    audio: null, music: null, burnCaptions: false,
  });
  assert.deepEqual(validateSceneModel(validateProjectForBuild(complete)), validateProjectForBuild(complete));
  const overflow = await store.save(p.id, { music: { asset: 'music.wav', start: 0, end: 1, timelineStart: 1 } });
  assert.throws(() => validateProjectForBuild(overflow), /music/);
});

test('save, reload and render video, logo, image fit, font family and trimmed/delayed audio', async t => {
  await fs.mkdir(ASSET_ROOT, { recursive: true });
  const root = await fs.mkdtemp(path.join(ASSET_ROOT, 'project-render-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await sharp({ create: { width: 30, height: 20, channels: 4, background: '#00ff00' } }).png().toFile(path.join(root, 'image.png'));
  await run(['-y', '-f', 'lavfi', '-i', 'color=blue:s=320x180:r=10', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(root, 'clip.mp4')]);
  // Explicit synthetic test tone, never represented as narration from a real voice.
  await run(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1', path.join(root, 'tone.wav')]);
  const store = createProjectStore(path.join(root, 'store'));
  const draft = await store.create('news-article');
  const p = await store.save(draft.id, {
    title: 'Saved renderer compatibility fixture', width: 320, height: 180, fps: 10,
    srt: '1\n00:00:00,100 --> 00:00:00,700\nSynthetic test tone',
    scenes: [{ id: 'video', duration: 1, background: '#000000', video: { asset: 'clip.mp4', start: 0 }, layers: [
      { id: 'logo', type: 'logo', asset: 'image.png', x: 10, y: 10, width: 40, height: 40, fit: 'contain' },
      { id: 'image', type: 'image', asset: 'image.png', x: 270, y: 10, width: 40, height: 40, fit: 'cover' },
      { id: 'text', type: 'text', text: 'Saved fixture', x: 60, y: 30, width: 180, height: 50, fontSize: 20, fontFamily: 'sans-serif', color: '#ffffff' },
    ] }],
    audio: { asset: 'tone.wav', start: 0.1, end: 0.7, volume: 0.5 },
    music: { asset: 'tone.wav', start: 0.1, end: 0.5, timelineStart: 0.5, volume: 0.12, fadeIn: 0.05, fadeOut: 0.05 },
    voice: 'Synthetic test tone',
  });
  const loaded = await createProjectStore(path.join(root, 'store')).get(p.id);
  const model = validateProjectForBuild(loaded);
  const result = await renderStudio({ request: { project: loaded } }, root);
  assert.equal(result.width, 320); assert.equal(result.height, 180);
  assert.ok(Math.abs(result.duration - 1) < 0.1);
  assert.equal(result.narration, true); assert.equal(result.music, true);
  const rendered = JSON.parse(await fs.readFile(path.join(path.dirname(result.file), 'model.json'), 'utf8'));
  assert.deepEqual(rendered, model);
  assert.equal(rendered.scenes[0].layers[1].fit, 'cover');
  assert.equal(rendered.audio.start, 0.1); assert.equal(rendered.audio.end, 0.7);
  assert.equal(rendered.music.timelineStart, 0.5);
  assert.deepEqual(await store.get(p.id), loaded); // Rendering never advances saved freshness.
});

test('new projects enable captions while an explicit saved off preference survives reload',async t=>{const {store,dir}=await fixture(t);const p=await store.create('player-club');assert.equal(p.burnCaptions,true);await store.save(p.id,{burnCaptions:false});assert.equal((await createProjectStore(dir).get(p.id)).burnCaptions,false);});
