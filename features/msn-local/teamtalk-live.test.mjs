import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkspaceStore} from './workspace-store.mjs';
import {diskObjectStore} from './disk-object-store.mjs';
import {workspaceRead, workspaceWrite} from './workspace-api.mjs';
import {createProjectStore} from './projects.mjs';
import {
  TEAMTALK_LIVE_AUTOMATION,
  TEAMTALK_LIVE_TEMPLATE,
  appendTeamtalkLesson,
  resolveTeamtalkAssets,
  runTeamtalkAutomation,
  selectTeamtalkStories,
  teamtalkQualityReport,
} from './teamtalk-live.mjs';

const now = '2026-11-04T22:00:00.000Z';
const story = (id, hours, extra = {}) => ({
  id,
  brand: 'TEAMtalk',
  title: extra.title || `${id} headline`,
  sourceUrl: `https://www.teamtalk.com/${id}`,
  publishedAt: new Date(Date.parse(now) - hours * 36e5).toISOString(),
  topic: extra.topic || id,
  ...extra,
});

test('three fresh TEAMtalk stories are selected and older stories do not fill a gap', () => {
  const picked = selectTeamtalkStories([
    story('one', 2),
    story('two', 10),
    story('three', 20),
    story('old', 60, {topic: 'old-news'}),
    story('other-brand', 1, {brand: 'Football365'}),
  ], [], now);
  assert.equal(picked.ok, true);
  assert.equal(picked.windowHours, 24);
  assert.deepEqual(picked.selected.map(item => item.articleId), ['one', 'two', 'three']);
  const short = selectTeamtalkStories([story('one', 2), story('old', 70)], [], now);
  assert.equal(short.ok, false);
  assert.equal(short.selected.length, 1);
  assert.match(short.reason, /notify Admin/);
});

test('a previous bulletin blocks the same development and a single-story use does not', () => {
  const articles = [story('repeat', 1, {topic: 'arsenal-deal', title: 'New Arsenal headline'}), story('two', 3), story('three', 4)];
  const blocked = selectTeamtalkStories(articles, [{kind: 'bulletin', topic: 'arsenal-deal', title: 'Old Arsenal headline', articleId: 'older', sourceUrl: 'https://www.teamtalk.com/older'}], now);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.selected.some(item => item.articleId === 'repeat'), false);
  const reused = selectTeamtalkStories(articles, [{kind: 'single', articleId: 'repeat', sourceUrl: 'https://www.teamtalk.com/repeat', title: 'New Arsenal headline'}], now);
  assert.equal(reused.ok, true);
  assert.equal(reused.selected[0].priorSingle, true);
});

test('the 48 hour window is used only when the last day has fewer than three stories', () => {
  const picked = selectTeamtalkStories([story('one', 2), story('two', 30), story('three', 40)], [], now);
  assert.equal(picked.ok, true);
  assert.equal(picked.windowHours, 48);
  assert.deepEqual(picked.selected.map(item => item.articleId), ['one', 'two', 'three']);
});

test('library matching does not invent a studio, presenter or voice', () => {
  const empty = resolveTeamtalkAssets([]);
  assert.deepEqual(empty.missing, ['studio', 'daniel', 'maya']);
  assert.deepEqual(empty.found, {});
  const resolved = resolveTeamtalkAssets([
    {name: 'TEAMtalk-LIVE-Empty-Studio-1920x1080', asset: 'uploads/studio.mp4'},
    {name: 'Daniel Brooks presenting', asset: 'uploads/daniel.mp4', elevenlabsVoiceId: 'voice-daniel'},
    {name: 'Maya Bennett listening', asset: 'uploads/maya.mp4'},
  ]);
  assert.deepEqual(resolved.missing, []);
  assert.equal(resolved.found.daniel.voiceId, 'voice-daniel');
  assert.equal(resolved.found.maya.voiceId, null);
  assert.equal(resolved.found.studio.asset, 'uploads/studio.mp4');
});

test('quality checks stay not-run until evidence is supplied', () => {
  const report = teamtalkQualityReport();
  assert.equal(report.length, 17);
  assert.equal(report.every(item => item.result === 'not-run'), true);
  const checked = teamtalkQualityReport({'Daniel is on the left': true, 'Maya is on the right': false});
  assert.equal(checked.find(item => item.name === 'Daniel is on the left').result, 'passed');
  assert.equal(checked.find(item => item.name === 'Maya is on the right').result, 'failed');
  assert.equal(checked.filter(item => item.result === 'not-run').length, 15);
});

test('the automation stays paused and a lesson does not change V1.0', async () => {
  assert.equal(TEAMTALK_LIVE_AUTOMATION.status, 'Paused');
  assert.equal(TEAMTALK_LIVE_AUTOMATION.baseline, null);
  assert.equal(TEAMTALK_LIVE_AUTOMATION.externalPublishing, 'Disabled');
  assert.throws(() => runTeamtalkAutomation(), /separate Admin approval/);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'teamtalk-live-'));
  try {
    const workspace = createWorkspaceStore(diskObjectStore(root));
    const listed = await workspaceRead(workspace, 'automations');
    assert.equal(listed.automations[0].id, TEAMTALK_LIVE_AUTOMATION.id);
    assert.equal(listed.baseline, null);
    await assert.rejects(workspaceWrite(workspace, 'automations/run', {}), /paused/);
    const lesson = await workspaceWrite(workspace, 'automations/lesson', {owner: 'fiddle', note: 'Two stories shared a transfer topic.'});
    assert.equal(lesson.templateVersion, 'V1.0');
    assert.equal(lesson.applied, false);
    await assert.rejects(workspaceWrite(workspace, 'automations/lesson', {owner: 'bob', changeTemplate: true, note: 'Replace the studio.'}), /V1.0 is unchanged/);
    const project = await workspace.projects.create(TEAMTALK_LIVE_TEMPLATE, {title: 'TEAMtalk LIVE — Dual Presenter Test 001'});
    assert.equal(project.templateId, TEAMTALK_LIVE_TEMPLATE);
    assert.equal(project.productionProfile, TEAMTALK_LIVE_TEMPLATE);
    assert.equal(project.width, 1920);
    assert.equal(project.height, 1080);
    assert.equal(project.fps, 30);
    assert.equal(project.music.volume, 0.2);
    assert.equal(project.voice, '');
    assert.equal(project.elevenlabsVoiceId, '');
    assert.equal(project.scenes[0].layers.find(layer => layer.id === 'daniel-left').x < project.scenes[0].layers.find(layer => layer.id === 'maya-right').x, true);
    const store = createProjectStore(root);
    assert.equal((await store.list()).length, 0);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('a lesson record refuses an unknown owner', () => {
  assert.throws(() => appendTeamtalkLesson({teamtalkLessons: []}, {owner: 'halley', note: 'Check playback.'}), /Fiddle or Bob/);
});
