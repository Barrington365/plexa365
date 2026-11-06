import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {diskObjectStore} from './disk-object-store.mjs';
import {createWorkspaceStore} from './workspace-store.mjs';
import {librarySection} from './library-sections.mjs';
import {decideLegacyCopy, importLegacyAsset, legacyLibraryKey, loadLegacyInventory, selectLegacyCandidates} from './legacy-library-import.mjs';

test('inventory keeps manifest files that have bytes and reports the ones that do not', async () => {
  const listed = await loadLegacyInventory({
    list: async (store, prefix) => prefix === 'video/' ? [{rel: 'video/news-1.mp4', sourceUpdatedAt: '2024-05-01T12:00:00.000Z'}] : [],
    readJson: async (store, key) => {
      if (key === 'library-manifest.json') return [{id: 'news-1', video: 'video/news-1.mp4', title: 'Ignored row title'}];
      if (key === 'library-metadata.json') return {'news-1': {title: 'Saved headline'}};
      if (key === 'podcast-template-projects.json') return {projects: {show: {outputAudioRel: 'audio/podcast-template/show/final.mp3'}}};
      return null;
    },
    voiceRels: ['audio/news-1-voice-record.webm'],
  });
  assert.equal(listed.files.length, 1);
  assert.equal(listed.files[0].name, 'Saved headline');
  assert.equal(listed.files[0].sourceUpdatedAt, '2024-05-01T12:00:00.000Z');
  assert.deepEqual(listed.unavailable.map(file => file.rel).sort(), ['audio/news-1-voice-record.webm', 'audio/podcast-template/show/final.mp3']);
});

test('existing workspace videos and uploads are not copy targets', () => {
  const selected = selectLegacyCandidates({
    stored: [
      {rel: 'video/news-1.mp4', sourceStore: 'plexa-video-assets', sourceUpdatedAt: '2026-01-02T00:00:00.000Z'},
      {rel: 'uploads/story/custom-bg.mp4', sourceStore: 'plexa-video-assets', sourceUpdatedAt: '2026-01-03T00:00:00.000Z'},
      {rel: 'images/library/story/hero.png', sourceStore: 'plexa-library-assets', sourceUpdatedAt: null},
      {rel: 'audio/audio-studio/proj/voice.mp3', sourceStore: 'plexa-audio-studio-files', sourceUpdatedAt: '2026-01-04T00:00:00.000Z'},
    ],
    storedRels: new Set(['video/news-1.mp4', 'uploads/story/custom-bg.mp4', 'images/library/story/hero.png', 'audio/audio-studio/proj/voice.mp3']),
    manifestRels: ['video/missing.mp4'],
    referencedRels: ['audio/podcast-template/show/final.mp3', 'audio/news-1-voice-record.webm'],
    titles: {'video/news-1.mp4': 'Saved headline'},
  });
  assert.deepEqual(selected.files.map(file => file.rel), [
    'audio/audio-studio/proj/voice.mp3',
    'images/library/story/hero.png',
    'uploads/story/custom-bg.mp4',
    'video/news-1.mp4',
  ]);
  assert.equal(selected.files.at(-1).name, 'Saved headline');
  assert.deepEqual(selected.unavailable.map(file => file.rel), ['audio/news-1-voice-record.webm', 'audio/podcast-template/show/final.mp3', 'video/missing.mp4']);
  assert.equal(legacyLibraryKey('video/news-1.mp4'), 'legacy-library/video/news-1.mp4');
  assert.equal(decideLegacyCopy(null, {sha256: 'a', bytes: 2}), 'copy');
  assert.equal(decideLegacyCopy({sha256: 'a', bytes: 2}, {sha256: 'a', bytes: 2}), 'skip');
  assert.equal(decideLegacyCopy({sha256: 'a', bytes: 2}, {sha256: 'b', bytes: 2}), 'block');
});

test('a copy keeps the original time and leaves current workspace files unchanged', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-library-'));
  try {
    const workspace = createWorkspaceStore(diskObjectStore(root));
    const current = await workspace.putBytes('uploads/current.mp4', Buffer.from('current-studio'));
    const finished = await workspace.putBytes('videos/job.mp4', Buffer.from('finished-film'));
    await workspace.update(state => {
      state.assets[current.asset] = {...current, name: 'Current studio'};
      state.assets[finished.asset] = {...finished, name: 'Finished film'};
      state.jobs.push({id: 'job', status: 'complete'});
      state.websiteVideos = [{id: 'player', asset: finished.asset}];
      return true;
    });
    const source = {rel: 'video/news-1.mp4', name: 'Saved headline', bytes: Buffer.from('old-library-video'), sourceStore: 'plexa-video-assets', sourceUpdatedAt: '2024-05-01T12:00:00.000Z'};
    const copied = await importLegacyAsset(workspace, source);
    assert.equal(copied.decision, 'copy');
    assert.equal(copied.asset, 'legacy-library/video/news-1.mp4');
    const again = await importLegacyAsset(workspace, source);
    assert.equal(again.decision, 'skip');
    const state = (await workspace.snapshot()).state;
    assert.equal(state.assets['uploads/current.mp4'].name, 'Current studio');
    assert.equal(state.assets['videos/job.mp4'].name, 'Finished film');
    assert.equal(state.jobs.length, 1);
    assert.equal(state.websiteVideos.length, 1);
    const imported = state.assets[copied.asset];
    assert.equal(imported.librarySection, 'imported');
    assert.equal(imported.sourceUpdatedAt, '2024-05-01T12:00:00.000Z');
    assert.equal(imported.updatedAt, '2024-05-01T12:00:00.000Z');
    assert.equal(imported.published, undefined);
    assert.equal(librarySection(imported), 'imported');
    assert.equal(librarySection({asset: 'videos/job.mp4', name: 'Finished film', type: 'video'}), 'completed');
    assert.equal(librarySection({asset: 'uploads/current.mp4', name: 'Current studio', type: 'video', category: 'studio'}), 'studios');
    imported.sha256 = 'f'.repeat(64);
    await workspace.update(state => {
      state.assets[copied.asset].sha256 = 'f'.repeat(64);
      return true;
    });
    const blocked = await importLegacyAsset(workspace, source);
    assert.equal(blocked.decision, 'block');
    assert.equal((await workspace.snapshot()).state.assets[copied.asset].sha256, 'f'.repeat(64));
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
});
