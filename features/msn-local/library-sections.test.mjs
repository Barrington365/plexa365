import test from 'node:test';
import assert from 'node:assert/strict';
import {TEAMTALK_DELIVERY, TEAMTALK_MAYA_DELIVERY, TEAMTALK_PRESENTERS} from './teamtalk-live.mjs';
import {clipMatchesPresenter, duplicateGroups, labelLibraryAsset, librarySection, movementFromName, presenterFromName, presenterMenuLinks, PRESENTERS, projectAssetPaths, savePresenterProfile} from './library-sections.mjs';

test('known TEAMtalk files keep their paths and land in the Build Library', () => {
  const samples = [
    ['uploads/b4e4ac5f-426a-4380-bd20-ad6326cd3743.mp4', 'TEAMtalk-LIVE-Empty-Studio-1920x1080.mp4', 'video', 'studios'],
    ['uploads/1b4eb28c-562a-4aa5-bd54-9a22fea40ca2.mp4', 'teamtalk-intro.mp4', 'video', 'intros'],
    ['uploads/284b2214-5ff2-4246-9437-e35077761678.mp4', 'teamtalk-outro.mp4', 'video', 'outros'],
    ['imported-clips/asset-8.mp4', 'TEAMtalk_Transition_1920x1080.mp4', 'video', 'transitions'],
    ['uploads/5313c323-02f4-4207-9f0e-a102da7aa74d.mp4', 'Football365-Daniel-Brooks-V2-Listening.mp4', 'video', 'presenter-clips'],
    ['uploads/790f99f2-fc07-47fb-a116-e2b66def7454.mp4', 'Football365-Daniel-Brooks-V2-Point-Right.mp4', 'video', 'presenter-clips'],
    ['brand-assets/teamtalk-logo.png', 'teamtalk-logo.png', 'image', 'graphics'],
    ['uploads/4841e64c-3d17-4fa4-86fd-53a6d362b258.mp3', 'Football365-Original-News-Bed.mp3', 'audio', 'music'],
    ['videos/a04e8c72-8da9-4ff1-a575-e2e79e369a4a.mp4', 'TEAMtalk LIVE — Dual Presenter Test 001', 'video', 'completed'],
    ['renders/a04e8c72/scene-1.mp4', 'scene-1.mp4', 'video', 'intermediate'],
    ['thumbnails/25b6643f.jpg', 'Video thumbnail', 'image', 'intermediate'],
  ];
  for (const [asset, name, type, section] of samples) assert.equal(librarySection({asset, name, type}), section, name);
  assert.equal(presenterFromName('Football365-Maya-Bennett-Walking-Shadow-Reflection.mp4'), 'maya-bennett');
  assert.equal(movementFromName('Football365-Daniel-Brooks-V2-Point-Right.mp4'), 'Point Right');
  assert.equal(librarySection({asset: 'uploads/x.mp4', name: 'Idle.mp4', type: 'video', librarySection: 'presenter-clips'}), 'presenter-clips');
  assert.equal(librarySection({asset: 'legacy-library/video/news-1.mp4', name: 'Saved headline', type: 'video', librarySection: 'imported'}), 'imported');
  assert.equal(librarySection({asset: 'videos/a04e8c72-8da9-4ff1-a575-e2e79e369a4a.mp4', name: 'TEAMtalk LIVE — Dual Presenter Test 001', type: 'video'}), 'completed');
});

test('duplicate names are reported and files are not treated as one', () => {
  const groups = duplicateGroups([
    {asset: 'uploads/a.png', name: 'chelsea-logo.png'},
    {asset: 'uploads/b.png', name: 'chelsea-logo.png'},
    {asset: 'thumbnails/c.jpg', name: 'chelsea-logo.png'},
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].paths, ['uploads/a.png', 'uploads/b.png']);
});

test('presenter profiles use the saved voices and a project reference stays intact', () => {
  assert.equal(PRESENTERS[0].voiceId, TEAMTALK_PRESENTERS[0].elevenlabsVoiceId);
  assert.equal(PRESENTERS[1].voiceId, TEAMTALK_PRESENTERS[1].elevenlabsVoiceId);
  assert.equal(PRESENTERS[0].delivery.speed, TEAMTALK_DELIVERY.speed);
  assert.equal(PRESENTERS[1].delivery.speed, TEAMTALK_MAYA_DELIVERY.speed);
  const project = {audio: {asset: 'narration/mix.mp3'}, scenes: [{layers: [{asset: 'uploads/clip.mp4'}]}], metadata: {description: 'uploads/not-a-field.mp4'}};
  assert.deepEqual(projectAssetPaths(project).sort(), ['narration/mix.mp3', 'uploads/clip.mp4']);
  const state = {assets: {'uploads/clip.mp4': {asset: 'uploads/clip.mp4', name: 'Idle.mp4'}}};
  assert.equal(labelLibraryAsset(state, {asset: 'uploads/clip.mp4', section: 'presenter-clips'}).asset, 'uploads/clip.mp4');
  assert.equal(state.assets['uploads/clip.mp4'].asset, 'uploads/clip.mp4');
  assert.throws(() => labelLibraryAsset(state, {asset: 'uploads/clip.mp4', section: 'archive'}), /Build Library/);
});

test('a named presenter keeps the selected ElevenLabs voice and matches their own clips', () => {
  const state = {presenterProfiles: []};
  const saved = savePresenterProfile(state, {name: 'Naomi Carter', voice: 'Charlotte - Warm South African', voiceId: 'IgGJCWnIbnBRMGhMU9Z6'});
  assert.equal(saved.id, 'presenter-naomi-carter');
  assert.equal(saved.voice, 'Charlotte - Warm South African');
  assert.equal(saved.voiceId, 'IgGJCWnIbnBRMGhMU9Z6');
  assert.throws(() => savePresenterProfile(state, {name: 'Naomi Carter'}), /already exists/);
  const updated = savePresenterProfile(state, {name: 'Naomi Carter', voice: 'Charlotte - Warm South African', voiceId: 'IgGJCWnIbnBRMGhMU9Z6'});
  assert.equal(state.presenterProfiles.length, 1);
  assert.equal(updated.savedAt, state.presenterProfiles[0].savedAt);
  assert.equal(clipMatchesPresenter({name: 'Naomi-Navy-Seated-Presenting-Green.mp4', asset: 'uploads/a.mp4'}, saved), true);
  assert.equal(clipMatchesPresenter({name: 'Naomi-Navy-Standing-Welcome-Studio.mp4', asset: 'uploads/b.mp4'}, saved), true);
  assert.equal(clipMatchesPresenter({name: 'Football365-Daniel-Brooks-V2-Listening.mp4', asset: 'uploads/c.mp4'}, saved), false);
  assert.equal(movementFromName('Naomi-Navy-Standing-Welcome-Green.mp4'), 'Welcome');
  assert.throws(() => savePresenterProfile({presenterProfiles: []}, {name: 'Naomi Carter', voice: 'Charlotte', voiceId: 'not-a-voice'}), /ElevenLabs/);
  assert.deepEqual(presenterMenuLinks([{id: 'daniel-brooks', name: 'Daniel Brooks'}, {id: 'maya-bennett', name: 'Maya Bennett'}, {id: 'presenter-naomi-carter', name: 'Naomi Carter'}]), [
    ['/presenters#daniel-brooks', 'Daniel Brooks'],
    ['/presenters#maya-bennett', 'Maya Bennett'],
    ['/presenters#presenter-naomi-carter', 'Naomi Carter'],
    ['/presenters#add', 'Add Presenter'],
  ]);
});
