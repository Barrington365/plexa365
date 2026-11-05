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
  resolveTeamtalkPresenterClips,
  resolveTeamtalkStoryMedia,
  runTeamtalkAutomation,
  teamtalkNarrationPlan,
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

test('story media uses the article original and the current crest, and leaves an unknown crest empty', () => {
  const images = [{id: 'pic', kind: 'original', sourceUrl: 'https://www.teamtalk.com/chelsea'}];
  const assets = [
    {name: 'chelsea-logo-2006-2026.png', asset: 'uploads/old-chelsea.png'},
    {name: 'chelsea-logo.png', asset: 'uploads/chelsea.png'},
    {name: 'liverpool-fc-logo.png', asset: 'uploads/liverpool.png'},
    {name: 'manchester-united-logo.png', asset: 'uploads/united.png'},
  ];
  const chelsea = resolveTeamtalkStoryMedia({sourceUrl: 'https://www.teamtalk.com/chelsea', club: 'Chelsea'}, images, assets);
  assert.equal(chelsea.articleImage, 'images/pic.png');
  assert.equal(chelsea.crest, 'uploads/chelsea.png');
  assert.deepEqual(chelsea.missing, []);
  const united = resolveTeamtalkStoryMedia({sourceUrl: 'https://www.teamtalk.com/chelsea', club: 'Manchester United'}, images, assets);
  assert.equal(united.crest, 'uploads/united.png');
  const bayern = resolveTeamtalkStoryMedia({sourceUrl: 'https://www.teamtalk.com/kane', club: 'Bayern Munich'}, images, assets);
  assert.equal(bayern.articleImage, '');
  assert.equal(bayern.crest, '');
  assert.deepEqual(bayern.missing, ['article-image', 'club-crest']);
  const approved = resolveTeamtalkStoryMedia({sourceUrl: 'https://www.teamtalk.com/kane', club: 'Bayern Munich'}, [], [...assets, {name: 'Bayern Munich - club logo - football-logos.cc.png', asset: 'images/bayern.png'}]);
  assert.equal(approved.crest, 'images/bayern.png');
  assert.equal(approved.crestSource, 'crest');
  const pictured = resolveTeamtalkStoryMedia({id: 'kane', sourceUrl: 'https://www.teamtalk.com/kane', club: 'Bayern Munich'}, [{id: 'kane', kind: 'original', sourceUrl: 'https://www.teamtalk.com/kane'}], assets);
  assert.equal(pictured.crest, 'images/kane.png');
  assert.equal(pictured.crestSource, 'story-image');
  assert.deepEqual(pictured.missing, []);
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
  assert.equal(resolved.found.maya.voiceId, 'ZF6FPAbjXT4488VcRRnw');
  assert.equal(resolved.found.maya.voice, 'Amelia - Enthusiastic and Expressive');
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
    const daniel = project.scenes[0].layers.find(layer => layer.id === 'daniel-left');
    const maya = project.scenes[0].layers.find(layer => layer.id === 'maya-right');
    assert.equal(daniel.type, 'clip');
    assert.equal(maya.type, 'clip');
    assert.equal(daniel.x < maya.x, true);
    assert.equal(daniel.chroma, '#00d600');
    const crest = project.scenes[0].layers.find(layer => layer.id === 'club-crest');
    const article = project.scenes[0].layers.find(layer => layer.id === 'article-image');
    assert.equal(crest.x, 95);
    assert.equal(article.x, 1389);
    assert.equal(crest.asset, '');
    assert.equal(article.asset, '');
    assert.equal(listed.automations[0].screens.left, 'Story club crest');
    assert.equal(listed.automations[0].status, 'Paused');
    const store = createProjectStore(root);
    assert.equal((await store.list()).length, 0);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('presenter clips match hyphenated Library names and each speaker keeps a voice', () => {
  const resolved = resolveTeamtalkPresenterClips([
    {name: 'Football365-Daniel-Brooks-Presenting-Shadow.mp4', asset: 'uploads/daniel-shadow.mp4'},
    {name: 'Football365-Daniel-Brooks-Presenting.mp4', asset: 'uploads/daniel-v1.mp4'},
    {name: 'Football365-Daniel-Brooks-V2-Presenting.mp4', asset: 'uploads/daniel-presenting.mp4'},
    {name: 'Football365-Daniel-Brooks-Listening.mp4', asset: 'uploads/daniel-listening.mp4'},
    {name: 'Football365-Maya-Bennett-Presenting.mp4', asset: 'uploads/maya-presenting.mp4'},
    {name: 'Football365-Maya-Bennett-Listening.mp4', asset: 'uploads/maya-listening.mp4'},
  ]);
  assert.deepEqual(resolved.missing, []);
  assert.equal(resolved.clips.danielPresenting, 'uploads/daniel-presenting.mp4');
  assert.equal(resolved.clips.mayaListening, 'uploads/maya-listening.mp4');
  const script = 'Notes\n\nDaniel: Welcome to TEAMtalk LIVE.\n\nDaniel: Chelsea keep Colwill.\n\nMaya: That is the TEAMtalk LIVE bulletin.';
  const danielText = 'Welcome to TEAMtalk LIVE.\n\nChelsea keep Colwill.';
  const mayaText = 'That is the TEAMtalk LIVE bulletin.';
  const timed = text => ({characters: [...text], character_start_times_seconds: [...text].map((_, i) => i / 10), character_end_times_seconds: [...text].map((_, i) => (i + 1) / 10)});
  const scenes = [
    {id: 'intro', duration: 1, background: '#000000', layers: []},
    {id: 'colwill', duration: 2, background: '#000000', video: {asset: 'uploads/studio.mp4', start: 0, loop: true}, layers: [{id: 'club-crest', type: 'logo', asset: 'uploads/chelsea.png', x: 95, y: 358, width: 349, height: 250}, {id: 'daniel-left', type: 'clip', asset: '', x: 1, y: 1, width: 2, height: 2}]},
    {id: 'kane', duration: 2, background: '#000000', video: {asset: 'uploads/studio.mp4', start: 0, loop: true}, layers: [{id: 'club-crest', type: 'logo', asset: '', x: 95, y: 358, width: 349, height: 250}]},
    {id: 'outro', duration: 1, background: '#000000', layers: []},
  ];
  const plan = teamtalkNarrationPlan({script, danielAlignment: timed(danielText), mayaAlignment: timed(mayaText), scenes, fps: 10, clips: resolved.clips, danielDuration: 20, mayaDuration: 20});
  assert.equal(plan.danielText, danielText);
  assert.equal(plan.scenes[1].id, 'colwill-1');
  assert.equal(plan.scenes[1].layers.find(layer => layer.id === 'daniel-left').asset, 'uploads/daniel-presenting.mp4');
  assert.equal(plan.scenes[1].layers.find(layer => layer.id === 'maya-right').asset, 'uploads/maya-listening.mp4');
  assert.equal(plan.scenes[1].layers.some(layer => layer.id === 'club-crest'), true);
  assert.equal(plan.scenes.at(-2).layers.some(layer => layer.id === 'club-crest'), false);
  assert.equal(plan.scenes.at(-2).layers.find(layer => layer.id === 'maya-right').asset, 'uploads/maya-presenting.mp4');
  assert.doesNotMatch(plan.srt, /Daniel:|Maya:/);
  assert.equal(plan.placements[0].speaker, 'daniel');
  assert.equal(plan.placements[0].timeline, 1);
});

test('a lesson record refuses an unknown owner', () => {
  assert.throws(() => appendTeamtalkLesson({teamtalkLessons: []}, {owner: 'halley', note: 'Check playback.'}), /Fiddle or Bob/);
});
