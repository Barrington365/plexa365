/** TEAMtalk LIVE V1.0. A reusable Studio template and a paused automation. No render, narration or publication. */
import {randomUUID} from 'node:crypto';

export const TEAMTALK_LIVE_TEMPLATE = 'teamtalk-live-dual-presenter-v1';
export const TEAMTALK_LIVE_PROFILE = 'teamtalk-live-dual-presenter-v1';
export const TEAMTALK_LIVE_NAME = 'TEAMtalk LIVE — Dual Presenter News Studio V1.0';
export const TEAMTALK_LIVE_VERSION = 'V1.0';
export const TEAMTALK_LIVE_AUTOMATION_ID = 'teamtalk-live-three-story-bulletin';
export const TEAMTALK_EMPTY_STUDIO = 'TEAMtalk-LIVE-Empty-Studio-1920x1080';
/** TEAMtalk brand kit: mint behind a crest, navy behind a photograph. */
export const TEAMTALK_LOGO_BACKGROUND = '#2AF5C0';
export const TEAMTALK_PHOTO_BACKGROUND = '#0C1B28';
export const TEAMTALK_LOGO_INSET = 0.2;
export const TEAMTALK_PHOTO_INSET = 0.08;
export const TEAMTALK_SCREEN_BACKGROUND = TEAMTALK_PHOTO_BACKGROUND;

/** Green screens measured on TEAMtalk-LIVE-Empty-Studio-1920x1080. Left is the club crest. Right is the article image. */
export const TEAMTALK_LEFT_SCREEN = {
  x: 95, y: 358, width: 349, height: 250, fit: 'contain', screenBackground: TEAMTALK_LOGO_BACKGROUND, screenInset: TEAMTALK_LOGO_INSET,
  screenCorners: [[0.0005, 0.0017], [0.9982, 0.2186], [0.9986, 0.9242], [0.0009, 0.9991]],
};
export const TEAMTALK_RIGHT_SCREEN = {
  x: 1389, y: 203, width: 436, height: 509, fit: 'contain', screenBackground: TEAMTALK_PHOTO_BACKGROUND, screenInset: TEAMTALK_PHOTO_INSET,
  screenCorners: [[0.0059, 0.3355], [0.9966, 0.0003], [0.9983, 0.9982], [0.0006, 0.8462]],
};

/** Current crest files only. A historical variant is not a substitute. A missing crest is filled before a build. */
export const TEAMTALK_CREST_FILES = [
  {club: 'Chelsea', file: 'chelsea-logo.png'},
  {club: 'Manchester United', file: 'manchester-united-logo.png'},
  {club: 'Liverpool', file: 'liverpool-fc-logo.png'},
  {club: 'Bayern Munich', file: 'Bayern Munich - club logo - football-logos.cc.png'},
];

const STORY_CLUB = {colwill: 'Chelsea', sesko: 'Manchester United', kane: 'Bayern Munich'};

export const TEAMTALK_PRESENTERS = [
  {id: 'daniel-brooks', name: 'Daniel Brooks', position: 'left', style: 'Confident, experienced and slightly witty', voice: 'Planet F1 - Male - Sam', elevenlabsVoiceId: '2yqdQ7uuPQDBMgFA8dgu'},
  {id: 'maya-bennett', name: 'Maya Bennett', position: 'right', style: 'Upbeat, expressive, confident and engaging', voice: 'Amelia - Enthusiastic and Expressive', elevenlabsVoiceId: 'ZF6FPAbjXT4488VcRRnw'},
];

/** Same controls as the existing Energetic sports presenter profile. The account voices stay Sam and Amelia. */
export const TEAMTALK_DELIVERY = {speed: 1.06, stability: 0.38, style: 0.35, similarity_boost: 0.75, use_speaker_boost: false};
/** Amelia reads slower than Sam at the same pace, so Maya is a step quicker and a little more expressive. */
export const TEAMTALK_MAYA_DELIVERY = {speed: 1.14, stability: 0.32, style: 0.48, similarity_boost: 0.75, use_speaker_boost: false};

/** Person bounds measured on the existing green-screen presenter clips. Placed on the floor between the two screens. */
const TEAMTALK_PRESENTER_CROP = {x: 760, y: 120, width: 400, height: 920};
export const TEAMTALK_DANIEL_BOX = {x: 587, y: 465, width: 158, height: 362, chroma: '#00d600', crop: TEAMTALK_PRESENTER_CROP};
export const TEAMTALK_MAYA_BOX = {x: 1127, y: 465, width: 158, height: 362, chroma: '#00d600', crop: TEAMTALK_PRESENTER_CROP};

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
  screens: {
    studio: TEAMTALK_EMPTY_STUDIO,
    left: 'Story club crest',
    right: 'Article image',
    leftScreen: TEAMTALK_LEFT_SCREEN,
    rightScreen: TEAMTALK_RIGHT_SCREEN,
  },
  media: [
    'Import the article’s published image into the Library and use the original whose source URL matches the story.',
    'Place that image on the right green screen, contained on the TEAMtalk navy panel so the full picture stays visible.',
    'Place the story club’s current Library crest on the left green screen, inset on the TEAMtalk mint panel.',
    'Use only the current crest file, such as chelsea-logo.png, manchester-united-logo.png, or Bayern Munich - club logo - football-logos.cc.png. Do not use a historical variant.',
    'When that crest is missing, fill the screen with the story picture or another current Library image for that story. Do not leave the green screen visible, invent a crest, or cut one out of a photograph.',
    'Maya Bennett uses Amelia - Enthusiastic and Expressive, id ZF6FPAbjXT4488VcRRnw. Daniel Brooks uses Planet F1 - Male - Sam, id 2yqdQ7uuPQDBMgFA8dgu. Do not rename Amelia and do not regenerate either voice unless the script or these settings change.',
    'Daniel delivery is speed 1.06, stability 0.38, style 0.35, similarity 0.75, speaker boost off. Maya delivery is speed 1.14, stability 0.32, style 0.48, with the same similarity and speaker boost.',
    'Key the existing presenter clips onto the studio. The speaker uses Presenting and the other presenter uses Listening. Do not use seated, smile, nod, walking at the desk, or shadow clips.',
    'Give the narration an explicit start and end. The end is the programme duration. Test 001 uses the saved voice from 0 to 241.5 seconds.',
    'Render on the saved project. Finished scenes are kept and a worker time limit continues that project. Do not render those scenes again unless the user asks to render all scenes again.',
    'Save the finished draft to the TEAMtalk LIVE Studio playlist. Do not add it to the Football365 player playlist and do not publish.',
  ],
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
  {role: 'daniel', pattern: /daniel[-_\s]+brooks/i},
  {role: 'maya', pattern: /maya[-_\s]+bennett/i},
];

function sceneClub(scene) {
  return STORY_CLUB[String(scene?.id || '').split('-')[0]] || scene?.club || '';
}

function approvedCrest(club, assets) {
  const rule = TEAMTALK_CREST_FILES.find(item => item.club.toLowerCase() === String(club || '').toLowerCase());
  if (!rule) return null;
  return (assets || []).find(item => String(item?.name || '').toLowerCase() === rule.file.toLowerCase()) || null;
}

function currentLibraryPicture(scene, assets) {
  const words = String(sceneClub(scene)).toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 4);
  const token = String(scene?.id || '').split('-')[0];
  if (token.length > 3 && !words.includes(token)) words.push(token);
  const pictures = (assets || []).filter(item => {
    const name = `${item?.name || ''} ${item?.asset || ''}`;
    return item?.asset && /\.(png|jpe?g|webp)$/i.test(name) && !/shadow|reflection/i.test(name) && !/\b(19|20)\d{2}\b/.test(name);
  });
  for (const word of [...words].sort((a, b) => b.length - a.length)) {
    const hit = pictures.find(item => String(item?.name || '').toLowerCase().includes(word));
    if (hit) return hit;
  }
  return null;
}

function screenLayer(id, asset, box, fit) {
  return {id, type: id === 'article-image' ? 'image' : 'logo', text: '', asset, ...box, fit};
}

/** A looped studio scene keeps both screens filled. A missing crest uses the current crest, then the story picture, then another current Library image. */
export function coverTeamtalkScreens(scenes, assets = []) {
  return (scenes || []).map(scene => {
    if (!scene?.video?.loop) return scene;
    const layers = (scene.layers || []).filter(layer => layer?.asset || !['club-crest', 'article-image'].includes(layer?.id));
    const article = layers.find(layer => layer.id === 'article-image' && layer.asset);
    const crest = layers.find(layer => layer.id === 'club-crest' && layer.asset);
    const approved = approvedCrest(sceneClub(scene), assets);
    const picture = currentLibraryPicture(scene, assets);
    if (!crest) {
      const asset = approved?.asset || article?.asset || picture?.asset || '';
      if (asset) {
        const photo = asset !== approved?.asset;
        const box = photo ? {...TEAMTALK_LEFT_SCREEN, screenBackground: TEAMTALK_PHOTO_BACKGROUND, screenInset: TEAMTALK_PHOTO_INSET} : TEAMTALK_LEFT_SCREEN;
        layers.unshift(screenLayer('club-crest', asset, box, 'contain'));
      }
    }
    if (!article) {
      const filled = layers.find(layer => layer.id === 'club-crest' && layer.asset);
      const asset = picture?.asset || filled?.asset || '';
      if (asset) layers.unshift(screenLayer('article-image', asset, TEAMTALK_RIGHT_SCREEN, 'contain'));
    }
    return {...scene, layers};
  });
}

export function uncoveredTeamtalkScreens(scenes) {
  const open = [];
  for (const scene of scenes || []) {
    if (!scene?.video?.loop) continue;
    for (const id of ['club-crest', 'article-image']) {
      if (!(scene.layers || []).some(layer => layer.id === id && layer.asset)) open.push(`${scene.id} ${id}`);
    }
  }
  return open;
}

/**
 * Resolve one story's picture and crest.
 * The article image must already be a Library original for that source URL.
 * The crest must be the story club's current file. Another club mentioned in the story is not used.
 * A missing crest is filled with the story picture or another current Library image so the green screen is not left bare.
 */
export function resolveTeamtalkStoryMedia(story, images, assets) {
  const sourceUrl = typeof story?.sourceUrl === 'string' ? story.sourceUrl : '';
  const club = String(story?.club || '');
  const image = (images || []).find(item => item?.kind === 'original' && item.sourceUrl === sourceUrl && item.id);
  const crest = approvedCrest(club, assets);
  const picture = currentLibraryPicture({id: story?.id || '', club}, assets);
  const articleImage = image ? `images/${image.id}.png` : (picture?.asset || '');
  const crestAsset = crest?.asset || articleImage;
  const missing = [];
  if (!articleImage) missing.push('article-image');
  if (!crestAsset) missing.push('club-crest');
  return {
    articleImage,
    crest: crestAsset,
    crestFile: crest ? (TEAMTALK_CREST_FILES.find(item => item.club.toLowerCase() === club.toLowerCase())?.file || '') : '',
    crestSource: crest ? 'crest' : (crestAsset ? 'story-image' : ''),
    missing,
  };
}

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
    const presenter = TEAMTALK_PRESENTERS.find(person => person.id.startsWith(role.role));
    const voiceId = typeof hit.elevenlabsVoiceId === 'string' && hit.elevenlabsVoiceId ? hit.elevenlabsVoiceId : (presenter?.elevenlabsVoiceId || null);
    found[role.role] = {asset: hit.asset, name: hit.name, voiceId: voiceId || null, voice: presenter?.voice || ''};
  }
  return {found, missing};
}

/** Presenting and listening clips are separate files. A hyphenated Library name still matches. Shadow and reflection files are not used. */
export function resolveTeamtalkPresenterClips(assets) {
  const pick = (person, movement, prefer) => {
    const matches = (assets || []).filter(item => {
      const name = String(item?.name || '').replace(/[-_]+/g, ' ');
      return item?.asset && !/shadow|reflection/i.test(name) && new RegExp(person, 'i').test(name) && movement.test(name);
    });
    const preferred = prefer ? matches.find(item => prefer.test(String(item?.name || '').replace(/[-_]+/g, ' '))) : null;
    return (preferred || matches[0])?.asset || '';
  };
  const clips = {
    danielPresenting: pick('daniel brooks', /present/i, /\bv2\b/i),
    danielListening: pick('daniel brooks', /listen|react/i, /\bv2\b/i),
    mayaPresenting: pick('maya bennett', /present/i),
    mayaListening: pick('maya bennett', /listen|react/i),
  };
  const missing = Object.entries(clips).filter(([, asset]) => !asset).map(([role]) => role);
  return {clips, missing};
}

const STORY_ORDER = ['colwill', 'sesko', 'kane'];

/** Spoken paragraphs are labelled Daniel: or Maya:. Headings and source lines are not speech. */
export function parseTeamtalkTurns(script) {
  const turns = [];
  for (const part of String(script || '').trim().split(/\n\s*\n/)) {
    const match = part.match(/^(Daniel|Maya):\s*([\s\S]+)$/i);
    if (!match) continue;
    const text = match[2].trim();
    if (!text) continue;
    turns.push({speaker: match[1].toLowerCase() === 'daniel' ? 'daniel' : 'maya', text});
  }
  if (turns.length < 2 || !turns.some(turn => turn.speaker === 'daniel') || !turns.some(turn => turn.speaker === 'maya')) {
    throw Error('Mark each spoken paragraph Daniel: or Maya:. Both presenters need lines.');
  }
  return turns;
}

function storyFor(text) {
  if (/bulletin/i.test(text)) return 'kane';
  if (/colwill|acheampong|stamford|huddersfield/i.test(text)) return 'colwill';
  if (/sesko|calvert|mateta|balogun|number nine/i.test(text)) return 'sesko';
  if (/kane|bayern|ballon|kompany|al-hilal/i.test(text)) return 'kane';
  return '';
}

export function speakerScript(turns, speaker) {
  return turns.filter(turn => turn.speaker === speaker).map(turn => turn.text).join('\n\n');
}

function assignStories(turns) {
  let current = turns.map(turn => storyFor(turn.text)).find(Boolean) || 'colwill';
  return turns.map(turn => {
    const story = storyFor(turn.text);
    if (story) current = story;
    return {...turn, story: story || current};
  });
}

function storySource(scenes, story) {
  const named = (scenes || []).find(scene => (scene.id === story || String(scene.id || '').startsWith(`${story}-`)) && scene.video?.asset);
  if (named) return named;
  const looped = (scenes || []).filter(scene => scene.video?.loop && scene.video.asset);
  const found = looped[Math.max(0, STORY_ORDER.indexOf(story))] || looped[0];
  if (!found) throw Error('The story scene needs the empty studio video.');
  return found;
}

const stamp = t => {
  const n = Math.max(0, Math.round(t * 1000));
  return `${String(Math.floor(n / 3600000)).padStart(2, '0')}:${String(Math.floor(n / 60000) % 60).padStart(2, '0')}:${String(Math.floor(n / 1000) % 60).padStart(2, '0')},${String(n % 1000).padStart(3, '0')}`;
};

function sliceTurn(script, alignment, text, from) {
  if (!alignment || !Array.isArray(alignment.characters) || alignment.characters.join('') !== script) throw Error('Provider timing does not match the script. Audio retained; review alignment before retrying.');
  const starts = alignment.character_start_times_seconds, ends = alignment.character_end_times_seconds;
  if (starts?.length !== alignment.characters.length || ends?.length !== starts.length) throw Error('Incomplete narration timestamps.');
  const at = script.indexOf(text, from);
  if (at < 0 || at + text.length > starts.length) throw Error('Provider timing does not match the script. Audio retained; review alignment before retrying.');
  const start = starts[at], end = ends[at + text.length - 1];
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw Error('Invalid narration timestamps.');
  return {at, start, end, next: at + text.length};
}

function cuesFor(text, slice, alignment, timeline) {
  const starts = alignment.character_start_times_seconds, ends = alignment.character_end_times_seconds;
  const words = [...text.matchAll(/\S+/g)].map(match => ({
    text: match[0],
    start: timeline + starts[slice.at + match.index] - slice.start,
    end: timeline + ends[slice.at + match.index + match[0].length - 1] - slice.start,
  }));
  const cues = [];
  let cue;
  for (const word of words) {
    if (cue && (cue.text.length + word.text.length > 72 || word.end - cue.start > 5)) { cues.push(cue); cue = null; }
    if (!cue) cue = {...word};
    else { cue.text += ` ${word.text}`; cue.end = word.end; }
    if (/[.!?]$/.test(word.text)) { cues.push(cue); cue = null; }
  }
  if (cue) cues.push(cue);
  return cues;
}

function clipLayer(id, asset, box) {
  return {id, type: 'clip', asset, loop: true, ...box};
}

/**
 * Two speaker tracks stay separate. Each turn keeps its own voice, then lands on the shared timeline after the intro.
 * The speaker's Presenting clip is used; the other presenter uses Listening. Speaker labels are not captions.
 */
export function teamtalkNarrationPlan({script, danielAlignment, mayaAlignment, scenes, fps = 30, clips, danielDuration, mayaDuration}) {
  const turns = assignStories(parseTeamtalkTurns(script));
  const danielText = speakerScript(turns, 'daniel');
  const mayaText = speakerScript(turns, 'maya');
  const required = ['danielPresenting', 'danielListening', 'mayaPresenting', 'mayaListening'];
  if (required.some(role => !clips?.[role])) throw Error('Presenter Presenting and Listening clips are missing.');
  const intro = (scenes || []).find(scene => scene.id === 'intro') || scenes?.[0];
  const outro = (scenes || []).find(scene => scene.id === 'outro') || scenes?.at(-1);
  if (!intro || !outro || intro === outro) throw Error('The programme needs an intro and an outro.');
  const gapFrames = Math.round(0.3 * fps);
  let frame = Math.round(intro.duration * fps);
  let danielFrom = 0, mayaFrom = 0;
  const built = [], cues = [], placements = [];
  turns.forEach((turn, index) => {
    const alignment = turn.speaker === 'daniel' ? danielAlignment : mayaAlignment;
    const spoken = turn.speaker === 'daniel' ? danielText : mayaText;
    const slice = sliceTurn(spoken, alignment, turn.text, turn.speaker === 'daniel' ? danielFrom : mayaFrom);
    const limit = turn.speaker === 'daniel' ? danielDuration : mayaDuration;
    if (Number.isFinite(limit) && slice.end > limit + 0.1) throw Error('Generated audio is shorter than the timed line. Audio retained; review alignment before retrying.');
    if (turn.speaker === 'daniel') danielFrom = slice.next; else mayaFrom = slice.next;
    const speechFrames = Math.max(1, Math.round((slice.end - slice.start) * fps));
    const timeline = frame / fps;
    const source = storySource(scenes, turn.story);
    const graphics = coverTeamtalkScreens([{...source, id: turn.story, video: source.video?.loop ? source.video : {...(source.video || {}), loop: true}}])[0].layers
      .filter(layer => layer.asset && layer.id !== 'daniel-left' && layer.id !== 'maya-right');
    built.push({
      id: `${turn.story}-${index + 1}`,
      duration: (speechFrames + gapFrames) / fps,
      background: source.background || '#060d15',
      video: source.video,
      layers: [
        ...graphics,
        clipLayer('daniel-left', turn.speaker === 'daniel' ? clips.danielPresenting : clips.danielListening, TEAMTALK_DANIEL_BOX),
        clipLayer('maya-right', turn.speaker === 'maya' ? clips.mayaPresenting : clips.mayaListening, TEAMTALK_MAYA_BOX),
      ],
    });
    placements.push({speaker: turn.speaker, start: slice.start, end: slice.end, timeline});
    cues.push(...cuesFor(turn.text, slice, alignment, timeline));
    frame += speechFrames + gapFrames;
  });
  for (let i = 1; i < cues.length; i++) if (cues[i].start < cues[i - 1].end) cues[i - 1].end = cues[i].start;
  const keep = scene => ({...scene, layers: (scene.layers || []).filter(layer => layer.asset)});
  const duration = frame / fps + outro.duration;
  return {
    scenes: [keep(intro), ...built, keep(outro)],
    srt: cues.map((cue, index) => `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}`).join('\n\n'),
    duration,
    placements,
    danielText,
    mayaText,
  };
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
