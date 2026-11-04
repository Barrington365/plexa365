/** TEAMtalk LIVE V1.0. A reusable Studio template and a paused automation. No render, narration or publication. */
import {randomUUID} from 'node:crypto';

export const TEAMTALK_LIVE_TEMPLATE = 'teamtalk-live-dual-presenter-v1';
export const TEAMTALK_LIVE_PROFILE = 'teamtalk-live-dual-presenter-v1';
export const TEAMTALK_LIVE_NAME = 'TEAMtalk LIVE — Dual Presenter News Studio V1.0';
export const TEAMTALK_LIVE_VERSION = 'V1.0';
export const TEAMTALK_LIVE_AUTOMATION_ID = 'teamtalk-live-three-story-bulletin';
export const TEAMTALK_EMPTY_STUDIO = 'TEAMtalk-LIVE-Empty-Studio-1920x1080';

export const TEAMTALK_PRESENTERS = [
  {id: 'daniel-brooks', name: 'Daniel Brooks', position: 'left', style: 'Confident, experienced and slightly witty'},
  {id: 'maya-bennett', name: 'Maya Bennett', position: 'right', style: 'Upbeat, expressive, confident and engaging'},
];

export function teamtalkLiveDefaults() {
  return {
    productionProfile: TEAMTALK_LIVE_PROFILE,
    width: 1920,
    height: 1080,
    fps: 30,
    status: 'Draft',
    voice: '',
    elevenlabsVoiceId: '',
    burnCaptions: true,
    captionPreset: 'bold',
    captionTextColor: '#ffffff',
    captionHighlightColor: '#00e8f0',
    music: {asset: '', start: 0, end: 0, timelineStart: 0, volume: 0.2, fadeIn: 0, fadeOut: 0, ducking: true, loop: true},
    metadata: {
      description: 'TEAMtalk LIVE — Dual Presenter News Studio V1.0. Draft only. External publishing is disabled. Target duration 3:30–4:15 after approved narration. Baseline Test 001 is not started.',
      tags: ['TEAMtalk', 'TEAMtalk LIVE', 'V1.0'],
      sourceUrl: '',
      language: 'en-GB',
      seo: {title: '', description: '', tags: []},
    },
  };
}

export const TEAMTALK_LIVE_AUTOMATION = {
  id: TEAMTALK_LIVE_AUTOMATION_ID,
  name: 'TEAMtalk LIVE — Three Story News Bulletin',
  status: 'Paused',
  brand: 'TEAMtalk',
  templateId: TEAMTALK_LIVE_TEMPLATE,
  templateVersion: TEAMTALK_LIVE_VERSION,
  articles: 3,
  preferredAgeHours: 24,
  maximumAgeHours: 48,
  targetDuration: '3:30–4:15',
  minimumDuration: '3:10',
  output: 'MSN Video',
  publishing: 'Draft only',
  externalPublishing: 'Disabled',
  triggers: ['Manual Run', 'Scheduled Run', 'New Article Trigger'],
  schedule: 'Not configured',
  lastRun: null,
  nextRun: null,
  runHistory: [],
  unattended: false,
  baseline: null,
};

export function runTeamtalkAutomation() {
  throw Error('TEAMtalk LIVE automation is paused. Baseline Test 001 needs separate Admin approval.');
}

const qualityChecks = [
  'Three real, distinct TEAMtalk stories were selected',
  'Previous story usage was checked',
  'The correct empty studio was used',
  'Daniel is on the left',
  'Maya is on the right',
  'Presenter animations work',
  'Chroma-key removal works in the final render',
  'Correct club crests appear',
  'Article images match the story',
  'Voices match presenter profiles',
  'Dialogue sounds natural',
  'Captions match narration',
  'Music does not overpower speech',
  'Final duration exceeds three minutes',
  'The finished MP4 plays correctly',
  'Production usage is recorded',
  'No external publishing occurred',
];

/** A check is passed only when the caller supplies evidence. Nothing is assumed complete. */
export function teamtalkQualityReport(evidence = {}) {
  return qualityChecks.map(name => ({
    name,
    result: evidence[name] === true ? 'passed' : evidence[name] === false ? 'failed' : 'not-run',
  }));
}

function text(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function ageHours(publishedAt, now) {
  const published = Date.parse(publishedAt);
  const current = Date.parse(now);
  if (!Number.isFinite(published) || !Number.isFinite(current)) return null;
  return (current - published) / 36e5;
}

function developmentKey(article) {
  return text(article.topic) || text(article.title);
}

function bulletinHistory(history) {
  return (history || []).filter(item => item && item.kind !== 'single');
}

function blocked(article, history) {
  const title = text(article.title);
  const topic = text(article.topic);
  return bulletinHistory(history).some(item =>
    item.articleId === article.id ||
    (item.sourceUrl && item.sourceUrl === article.sourceUrl) ||
    text(item.title) === title ||
    (topic && text(item.topic) === topic));
}

function choose(rows, history) {
  const used = new Set();
  const selected = [];
  for (const article of rows) {
    const key = developmentKey(article);
    if (!key || blocked(article, history) || used.has(key) || used.has(article.id) || used.has(article.sourceUrl)) continue;
    used.add(key);
    used.add(article.id);
    used.add(article.sourceUrl);
    const priorSingle = (history || []).some(item => item.kind === 'single' && (item.articleId === article.id || item.sourceUrl === article.sourceUrl));
    selected.push({
      articleId: article.id,
      sourceUrl: article.sourceUrl,
      title: article.title,
      topic: article.topic || '',
      publishedAt: article.publishedAt,
      priorSingle,
    });
    if (selected.length === 3) break;
  }
  return selected;
}

/**
 * Select three imported TEAMtalk stories. Prefer 24 hours, then 48.
 * Older stories are not used to fill a short list.
 */
export function selectTeamtalkStories(articles, history = [], now) {
  const fresh = (articles || [])
    .filter(article => text(article?.brand) === 'teamtalk' && article.id && article.sourceUrl && article.title && article.publishedAt)
    .map(article => ({...article, age: ageHours(article.publishedAt, now)}))
    .filter(article => article.age !== null && article.age >= 0)
    .sort((a, b) => a.age - b.age);
  let selected = choose(fresh.filter(article => article.age <= 24), history);
  let windowHours = 24;
  if (selected.length < 3) {
    selected = choose(fresh.filter(article => article.age <= 48), history);
    windowHours = 48;
  }
  if (selected.length < 3) {
    return {
      ok: false,
      windowHours,
      selected,
      reason: 'Fewer than three suitable TEAMtalk stories. Stop and notify Admin.',
    };
  }
  return {ok: true, windowHours, selected, reason: ''};
}

const assetRoles = [
  {role: 'studio', pattern: /teamtalk-live-empty-studio-1920x1080/i},
  {role: 'daniel', pattern: /daniel brooks/i},
  {role: 'maya', pattern: /maya bennett/i},
];

/** Match saved Library names. Missing assets stay missing; no id or voice is invented. */
export function resolveTeamtalkAssets(assets) {
  const found = {};
  const missing = [];
  for (const role of assetRoles) {
    const hit = (assets || []).find(asset => role.pattern.test(String(asset?.name || '')));
    if (!hit?.asset) {
      missing.push(role.role);
      continue;
    }
    const voiceId = typeof hit.elevenlabsVoiceId === 'string' && hit.elevenlabsVoiceId ? hit.elevenlabsVoiceId : null;
    found[role.role] = {asset: hit.asset, name: hit.name, voiceId};
  }
  return {found, missing};
}

export function appendTeamtalkLesson(state, input) {
  if (!state || typeof state !== 'object') throw Error('Studio workspace is required');
  if (!['fiddle', 'bob'].includes(input?.owner)) throw Error('Only Fiddle or Bob can record a TEAMtalk lesson.');
  if (input.changeTemplate === true) throw Error('Template changes need Admin approval. V1.0 is unchanged.');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!note || note.length > 4000) throw Error('Record a factual lesson.');
  state.teamtalkLessons ??= [];
  const lesson = {
    id: randomUUID(),
    owner: input.owner,
    templateId: TEAMTALK_LIVE_TEMPLATE,
    templateVersion: TEAMTALK_LIVE_VERSION,
    note,
    savedAt: new Date().toISOString(),
    applied: false,
  };
  state.teamtalkLessons.push(lesson);
  return lesson;
}
