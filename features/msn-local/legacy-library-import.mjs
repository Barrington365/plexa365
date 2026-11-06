/** Copy old /library files into the workspace library. Never deletes or overwrites. */
import {createHash} from 'node:crypto';

export const LEGACY_LIBRARY_PREFIX = 'legacy-library/';
const MEDIA = /\.(mp4|webm|mov|gif|png|jpe?g|webp|mp3|m4a|wav|ogg|flac|srt|ass|json)$/i;

export function normaliseLegacyRel(rel) {
  const cleaned = String(rel || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.startsWith(LEGACY_LIBRARY_PREFIX) || cleaned.split('/').some(part => !part || part === '.' || part === '..')) return null;
  if (!MEDIA.test(cleaned)) return null;
  return cleaned;
}

export function legacyLibraryKey(rel) {
  const cleaned = normaliseLegacyRel(rel);
  if (!cleaned) throw Error('Invalid source path');
  return LEGACY_LIBRARY_PREFIX + cleaned;
}

export function legacySourceTab(rel) {
  const cleaned = normaliseLegacyRel(rel) || '';
  if (cleaned.startsWith('video/') || cleaned.startsWith('subtitles/') || /-engine\.json$/i.test(cleaned)) return 'builds';
  if (/^uploads\/[^/]+\/camera-record\.(mp4|webm)$/i.test(cleaned) || /^uploads\/[^/]+\/custom-bg\.mp4$/i.test(cleaned)) return 'backgroundVideo';
  if (cleaned.startsWith('images/library/') || /^uploads\/[^/]+\/custom-bg(?!-video-frame).+\.(png|jpe?g|webp|gif)$/i.test(cleaned)) return 'libraryImages';
  if (/^audio\/[^/]+-voice-record\.(webm|mp3|m4a|wav)$/i.test(cleaned)) return 'voiceRecordings';
  if (cleaned.startsWith('audio/audio-studio/')) return 'audioStudio';
  if (cleaned.startsWith('audio/podcast-template/') && MEDIA.test(cleaned) && !cleaned.endsWith('.json')) return 'podcasts';
  return '';
}

export function decideLegacyCopy(existing, incoming) {
  if (!existing) return 'copy';
  if (existing.sha256 === incoming.sha256 && existing.bytes === incoming.bytes) return 'skip';
  return 'block';
}

function displayName(rel, title) {
  const named = String(title || '').trim();
  if (named) return named.slice(0, 150);
  return rel.split('/').pop().slice(0, 150);
}

export function selectLegacyCandidates(input) {
  const chosen = new Map();
  const unavailable = [];
  function add(rel, sourceStore, sourceUpdatedAt, bytesAvailable) {
    const cleaned = normaliseLegacyRel(rel);
    const tab = cleaned ? legacySourceTab(cleaned) : '';
    if (!cleaned || !tab) return;
    if (bytesAvailable === false) {
      unavailable.push({rel: cleaned, tab, sourceStore, reason: 'Bytes are not in a durable store'});
      return;
    }
    if (chosen.has(cleaned)) return;
    chosen.set(cleaned, {
      rel: cleaned,
      tab,
      sourceStore,
      sourceUpdatedAt: sourceUpdatedAt || null,
      name: displayName(cleaned, input.titles?.[cleaned]),
    });
  }
  for (const item of input.stored || []) add(item.rel, item.sourceStore, item.sourceUpdatedAt, true);
  for (const rel of input.manifestRels || []) add(rel, 'plexa-video-assets', null, input.storedRels ? input.storedRels.has(rel) : true);
  for (const rel of input.referencedRels || []) add(rel, input.referenceStore || 'referenced', null, input.storedRels?.has(rel) === true);
  return {
    files: [...chosen.values()].sort((a, b) => a.rel.localeCompare(b.rel)),
    unavailable: unavailable.sort((a, b) => a.rel.localeCompare(b.rel)),
  };
}

export async function loadLegacyInventory(io) {
  const stored = [];
  for (const [sourceStore, prefix] of [
    ['plexa-video-assets', 'video/'],
    ['plexa-video-assets', 'subtitles/'],
    ['plexa-video-assets', 'uploads/'],
    ['plexa-library-assets', 'images/library/'],
    ['plexa-audio-studio-files', 'audio/'],
  ]) {
    for (const item of await io.list(sourceStore, prefix)) stored.push({rel: item.rel, sourceStore, sourceUpdatedAt: item.sourceUpdatedAt || null});
  }
  const storedRels = new Set(stored.map(item => normaliseLegacyRel(item.rel)).filter(Boolean));
  const manifest = await io.readJson('plexa-video-assets', 'library-manifest.json');
  const metadata = (await io.readJson('plexa-library', 'library-metadata.json')) || {};
  const podcasts = await io.readJson('plexa-podcast-template', 'podcast-template-projects.json');
  const titles = {};
  const manifestRels = [];
  if (Array.isArray(manifest)) {
    for (const row of manifest) {
      for (const rel of [row?.video, row?.editedVideo, row?.subtitles]) if (typeof rel === 'string') manifestRels.push(rel);
      const cleaned = normaliseLegacyRel(row?.video);
      if (cleaned && row?.id && metadata?.[row.id]?.title) titles[cleaned] = metadata[row.id].title;
    }
  }
  const referencedRels = [];
  for (const project of Object.values(podcasts?.projects || {})) if (typeof project?.outputAudioRel === 'string') referencedRels.push(project.outputAudioRel);
  for (const rel of io.voiceRels || []) referencedRels.push(rel);
  return selectLegacyCandidates({stored, storedRels, manifestRels, referencedRels, referenceStore: 'plexa-podcast-template', titles});
}

export async function importLegacyAsset(workspace, source) {
  const asset = legacyLibraryKey(source.rel);
  if (!asset.startsWith(LEGACY_LIBRARY_PREFIX)) throw Error('Legacy copies stay under legacy-library/');
  const bytes = Buffer.from(source.bytes);
  if (!bytes.length) throw Error('Empty source file');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const before = (await workspace.snapshot()).state;
  const protectedKeys = Object.keys(before.assets).filter(key => !key.startsWith(LEGACY_LIBRARY_PREFIX));
  const decision = decideLegacyCopy(before.assets[asset], {sha256, bytes: bytes.length});
  if (decision !== 'copy') return {decision, asset, sha256, bytes: bytes.length, sourceRel: source.rel};
  const stored = await workspace.putBytes(asset, bytes, {});
  const readBack = await workspace.readFile(stored);
  if (stored.sha256 !== sha256 || stored.bytes !== bytes.length || createHash('sha256').update(readBack).digest('hex') !== sha256) throw Error('Stored copy failed integrity check');
  const importedAt = new Date().toISOString();
  const entry = {
    ...stored,
    name: displayName(source.rel, source.name),
    librarySection: 'imported',
    sourceRel: source.rel,
    sourceStore: source.sourceStore,
    sourceUpdatedAt: source.sourceUpdatedAt || null,
    importedAt,
    updatedAt: source.sourceUpdatedAt || null,
  };
  let result;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      result = await workspace.update(state => {
        const again = decideLegacyCopy(state.assets[asset], entry);
        if (again === 'block') throw Error('Existing library file differs');
        if (again === 'copy') state.assets[asset] = entry;
        return {decision: again, asset, sha256, bytes: bytes.length, sourceRel: source.rel, sourceUpdatedAt: entry.sourceUpdatedAt, importedAt};
      });
      break;
    } catch (error) {
      if (attempt === 3 || !String(error.message || '').includes('Another editor')) throw error;
    }
  }
  const after = (await workspace.snapshot()).state;
  for (const key of protectedKeys) {
    if (JSON.stringify(after.assets[key]) !== JSON.stringify(before.assets[key])) throw Error('Existing workspace file changed');
  }
  if (after.jobs.length !== before.jobs.length || (after.websiteVideos || []).length !== (before.websiteVideos || []).length) throw Error('Import changed publication records');
  return result;
}
