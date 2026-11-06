/** Library views over existing files. Paths and bytes stay where they are. */
export const BUILD_SECTIONS = [
  ['studios', 'Studios & Backgrounds'],
  ['intros', 'Intros'],
  ['outros', 'Outros'],
  ['transitions', 'Transitions'],
  ['presenter-clips', 'Presenter Clips & Actions'],
  ['graphics', 'Graphics & Logos'],
  ['music', 'Music & Sound'],
  ['story-images', 'Story images'],
];
export const PRODUCTION_SECTIONS = [
  ['drafts', 'Drafts & In Progress'],
  ['completed', 'Completed Videos'],
  ['published', 'Published Videos'],
  ['archive', 'Archive'],
];
export const PRESENTERS = [
  {id: 'daniel-brooks', name: 'Daniel Brooks', role: 'Lead Presenter', brand: 'TEAMtalk', position: 'left', biography: 'Confident, experienced and slightly witty.', voice: 'Planet F1 - Male - Sam', voiceId: '2yqdQ7uuPQDBMgFA8dgu', delivery: {speed: 1.06, stability: 0.38, style: 0.35, similarity: 0.75, speakerBoost: false}},
  {id: 'maya-bennett', name: 'Maya Bennett', role: 'Co-Presenter', brand: 'TEAMtalk', position: 'right', biography: 'Upbeat, expressive, confident and engaging.', voice: 'Amelia - Enthusiastic and Expressive', voiceId: 'ZF6FPAbjXT4488VcRRnw', delivery: {speed: 1.14, stability: 0.32, style: 0.48, similarity: 0.75, speakerBoost: false}},
];
const SECTION_IDS = new Set([...BUILD_SECTIONS, ...PRODUCTION_SECTIONS].map(([id]) => id));
const edge = '(?:^|[\\s_./-])';
const end = '(?:[\\s_./-]|$)';
function textOf(asset) { return `${asset?.name || ''} ${asset?.asset || ''}`.toLowerCase(); }
function has(name, word) { return new RegExp(edge + word + end).test(name); }
export function presenterFromName(value) {
  const name = String(value || '').toLowerCase();
  if (name.includes('daniel brooks') || name.includes('daniel-brooks')) return 'daniel-brooks';
  if (name.includes('maya bennett') || name.includes('maya-bennett')) return 'maya-bennett';
  return '';
}
export function movementFromName(value) {
  const name = String(value || '').toLowerCase();
  if (has(name, 'point-left') || has(name, 'point left')) return 'Point Left';
  if (has(name, 'point-right') || has(name, 'point right')) return 'Point Right';
  for (const word of ['presenting', 'listening', 'walking', 'idle', 'welcome']) if (has(name, word)) return word[0].toUpperCase() + word.slice(1);
  return '';
}
export function clipMatchesPresenter(asset, person) {
  const hay = `${asset?.name || ''} ${asset?.asset || ''}`;
  const known = presenterFromName(hay);
  if (known) return known === person?.id;
  const full = String(person?.name || '').toLowerCase().trim();
  if (!full) return false;
  const text = hay.toLowerCase();
  if (text.includes(full) || text.includes(full.replace(/\s+/g, '-'))) return true;
  const first = full.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return first.length >= 4 && new RegExp('(?:^|[\\s_./-])' + first + '(?:[\\s_./-]|$)').test(text);
}
export function isShadowClip(value) { return /shadow|reflection/i.test(String(value || '')); }
export function librarySection(asset) {
  const path = String(asset?.asset || '');
  const name = textOf(asset);
  if (path.startsWith('thumbnails/') || path.startsWith('renders/') || path.startsWith('scene-')) return 'intermediate';
  if (asset?.trashed) return 'archive';
  if (asset?.published) return 'published';
  if (asset?.kind === 'completed' || path.startsWith('videos/')) return 'completed';
  const stored = asset?.librarySection || asset?.category;
  if (stored === 'background' || stored === 'studio') return 'studios';
  if (stored === 'presenter') return 'presenter-clips';
  if (SECTION_IDS.has(stored)) return stored;
  if (has(name, 'intros?') || has(name, 'intro')) return 'intros';
  if (has(name, 'outros?') || has(name, 'outro')) return 'outros';
  if (has(name, 'transitions?') || has(name, 'transition')) return 'transitions';
  if (asset?.type === 'video' && (presenterFromName(name) || has(name, 'present(?:er|or|ing)'))) return 'presenter-clips';
  if (has(name, 'studios?') || has(name, 'backgrounds?') || has(name, 'backdrop')) return 'studios';
  if (asset?.type === 'audio' || path.startsWith('narration/') || has(name, 'music') || has(name, 'bed')) return 'music';
  if (path.startsWith('brand-assets/') || has(name, 'logos?') || has(name, 'crests?') || has(name, 'badges?') || has(name, 'wordmarks?')) return 'graphics';
  if (asset?.type === 'image') return 'story-images';
  return 'unsectioned';
}
export function duplicateGroups(assets) {
  const groups = new Map();
  for (const asset of assets || []) {
    if (!asset?.name || String(asset.asset || '').startsWith('thumbnails/')) continue;
    const key = String(asset.name).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(asset.asset);
    groups.set(key, list);
  }
  return [...groups].filter(([, list]) => new Set(list).size > 1).map(([name, paths]) => ({name, paths: [...new Set(paths)]}));
}
const BUILD_IDS = new Set(BUILD_SECTIONS.map(([id]) => id));
export function labelLibraryAsset(state, body) {
  const asset = state?.assets?.[body?.asset];
  if (!asset || asset.asset !== body.asset) throw Error('Choose a stored Library file');
  if (!BUILD_IDS.has(body.section)) throw Error('Choose a Build Library section');
  asset.librarySection = body.section;
  asset.libraryLabeledAt = new Date().toISOString();
  return {asset: asset.asset, librarySection: asset.librarySection};
}
export function savePresenterProfile(state, body) {
  const name = String(body?.name || '').trim();
  if (!name || name.length > 80) throw Error('Enter a presenter name');
  if (PRESENTERS.some(person => person.name.toLowerCase() === name.toLowerCase())) throw Error('Daniel Brooks and Maya Bennett already have profiles');
  state.presenterProfiles ??= [];
  const id = 'presenter-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id || id === 'presenter-') throw Error('Enter a presenter name');
  const voice = String(body?.voice || '').trim().slice(0, 120);
  const voiceId = String(body?.voiceId || '').trim();
  if (voiceId && (!voice || !/^[A-Za-z0-9]{20}$/.test(voiceId))) throw Error('Choose an ElevenLabs voice');
  const existing = state.presenterProfiles.find(person => person.id === id);
  if (existing) {
    if (!voiceId) throw Error('A presenter with that name already exists');
    existing.voice = voice;
    existing.voiceId = voiceId;
    existing.savedAt = new Date().toISOString();
    return existing;
  }
  const profile = {id, name, role: String(body.role || 'Presenter').slice(0, 80), brand: String(body.brand || '').slice(0, 80), biography: String(body.biography || '').slice(0, 500), voice, voiceId, savedAt: new Date().toISOString()};
  state.presenterProfiles.push(profile);
  return profile;
}
export function presenterCatalogue(state) {
  return [...PRESENTERS, ...(state?.presenterProfiles || [])];
}
export function presenterMenuLinks(presenters = []) {
  const links = [['/presenters#daniel-brooks', 'Daniel Brooks'], ['/presenters#maya-bennett', 'Maya Bennett']];
  for (const person of presenters) {
    const id = String(person?.id || '');
    const name = String(person?.name || '').trim();
    if (!/^[a-z0-9-]{1,80}$/.test(id) || !name || links.some(([, label]) => label === name)) continue;
    links.push(['/presenters#' + id, name]);
  }
  links.push(['/presenters#add', 'Add Presenter']);
  return links;
}
export function projectAssetPaths(project) {
  const paths = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.asset === 'string' && /\.(mp4|mp3|png|jpe?g|webp|wav|m4a)$/i.test(value.asset)) paths.add(value.asset);
    for (const child of Object.values(value)) visit(child);
  };
  visit(project);
  return [...paths];
}
