import {renderFont,renderFontsDirectory} from './render-fonts.mjs';
/** Local-only saved-scene renderer. Coordinates/font sizes are pixels; times seconds.
 * renderStudio(job, root, signal, update) reads job.request.project. Null/empty
 * audio/music defaults are omitted by this adapter. renderScenes accepts the schema.
 * Layers paint in array order. Source-video audio is muted. Missing tracks yield silence.
 * Narration starts at timeline zero: optional audio.start/end are explicit source trims
 * (both required together). Untrimmed narration longer than the timeline is rejected;
 * shorter narration is padded with silence. Duration probes have 0.01-second precision.
 * Music start/end trim its source; timelineStart (default 0) independently delays it.
 * Fades apply within the trimmed clip. No looping, ducking or loudness normalization.
 * Burned captions must parse as ordered nonoverlapping SRT, <=600 cues, <=300 characters
 * per cue, ending within the timeline. Caption markup is stripped; burn=false ignores SRT.
 * ASS PlayRes matches the canvas. Caption sizes are 52/56 at 1080p; marginV=55,
 * all scaled by height. Captions use at most two measured lines, shrink to fit if needed,
 * and fail if unreadable at <12px (1080p equivalent). Bold highlights metadata.tags cyan.
 * voice is null until trusted provenance exists; requestedVoice is only a user label,
 * voiceProvenance is unverified for every supplied narration (no trusted registry yet).
 * Text is plain escaped text, wrapped at width (word/character fallback), explicit newlines
 * retained, cropped at height; omitted dimensions use remaining canvas space. Sharp/Pango
 * uses local fonts, default sans-serif bold, optional fontFamily. Font substitution and
 * line metrics can differ from browser system fonts/CSS 1.15 line-height: not pixel parity.
 * No auto-fit or font downloads. Image/logo fit defaults to contain.
 * Limits: 100 scenes, 50 layers/scene, 1200s total; scenes >=0.2s in whole frames;
 * canvas 64..3840 even pixels, 1..60fps; text <=2000 chars, fontSize 8..300.
 * Images: PNG/JPEG/WebP; video: MP4/MOV/WebM/MKV; audio: WAV/MP3/M4A/FLAC/OGG.
 * Assets are root-relative under output/msn-local; remote paths and symlink escapes fail.
 * Returns file, metadataFile, dimensions, duration, audio, expectedDuration, updatedAt.
 * Successful output includes model.json and metadata.json; failed/cancelled jobs publish
 * nothing. UTC updatedAt describes successful rendering, not source/factual verification.
 * The saved-project store/UI are not changed here: they must support new optional fields
 * (audio.start/end, music.timelineStart, fontFamily) before those fields can round-trip.
 */
import {motionChoices, motionFilters} from './animation.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { run, probe } from './engine.mjs';
import { parseSrt } from './article.mjs';

// Runtime data is not a bundled source asset. Hosted workers pass their own root.
export const ASSET_ROOT = path.resolve(process.cwd(), 'output/msn-local');
export const CAPTION_PRESETS = Object.freeze({
  standard: Object.freeze({ fontSize: 52, bold: false, boxed: false }),
  bold: Object.freeze({ fontSize: 56, bold: true, boxed: false }),
  boxed: Object.freeze({ fontSize: 52, bold: false, boxed: true }),
});
const seconds = z.number().finite().min(0).max(1200);
const colour = z.string().regex(/^#[\da-f]{6}$/i);
const asset = z.string().min(1).max(4096);
const position = { x: z.number().int().min(0).max(4096), y: z.number().int().min(0).max(4096) };
const size = { width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096) };
const animationSchema=z.object(Object.fromEntries(Object.entries(motionChoices).map(([phase,effects])=>[phase,z.object({effect:z.enum(effects),duration:z.number().finite().min(.1).max(120),delay:seconds,intensity:z.number().finite().min(0).max(100),loop:z.boolean()}).strict().optional()]))).strict().optional();
const picture = type => z.object({ animation:animationSchema, id: z.string().optional(), type: z.literal(type), asset, text: z.string().max(2000).optional(), fontSize: z.number().finite().optional(), color: colour.optional(), ...position, ...size, fit: z.enum(['contain', 'cover', 'fill']).default('contain') }).strict();
export const sceneModelSchema = z.object({
  version: z.literal(1).default(1), title: z.string().max(200).default('Scene render'),
  width: z.number().int().min(64).max(3840).multipleOf(2).default(1920),
  height: z.number().int().min(64).max(3840).multipleOf(2).default(1080),
  fps: z.number().int().min(1).max(60).default(30),
  scenes: z.array(z.object({
    id: z.string().optional(), duration: z.number().finite().min(.2).max(1200), background: colour.default('#000000'),
    video: z.object({ asset, start: seconds.default(0) }).strict().optional(),
    layers: z.array(z.discriminatedUnion('type', [picture('image'), picture('logo'),
      z.object({ animation:animationSchema, id: z.string().optional(), width: size.width.optional(), height: size.height.optional(), type: z.literal('text'), asset: z.string().max(4096).optional(), text: z.string().min(1).max(2000), ...position,
        fontSize: z.number().int().min(8).max(300), fontFamily: z.string().regex(/^[a-zA-Z][a-zA-Z0-9 -]{0,79}$/).default('sans-serif'), color: colour.default('#ffffff') }).strict(),
    ])).max(50).default([]),
  }).strict()).min(1).max(100),
  audio: z.object({ asset, start: seconds.optional(), end: seconds.optional(), volume: z.number().finite().min(0).max(4).default(1) }).strict().optional(),
  music: z.object({ asset, start: seconds.default(0), end: seconds, timelineStart: seconds.default(0),
    volume: z.number().finite().min(0).max(4).default(1), fadeIn: seconds.default(0), fadeOut: seconds.default(0),
  }).strict().optional(),
  srt: z.string().max(200000).default(''), burnCaptions: z.boolean().default(false),
  captionPreset: z.enum(['standard', 'bold', 'boxed']).default('standard'),
  captionTextColor: colour.default('#ffffff'), captionHighlightColor: colour.default('#00ffff'),
  voice: z.string().max(200).optional(),
  metadata: z.object({ description: z.string().max(10000).default(''), tags: z.array(z.string().max(200)).max(100).default([]),
    sourceUrl: z.string().max(4096).default(''), language: z.string().max(100).default(''),
  }).strict().optional(),
}).strict();
export const SCENE_MODEL_SCHEMA = z.toJSONSchema(sceneModelSchema);
export function validateSceneModel(input) {
  const model = sceneModelSchema.parse(input);
  const total = model.scenes.reduce((sum, s) => sum + s.duration, 0);
  if (total > 1200) throw Error('Maximum duration is 1200 seconds');
  for (const s of model.scenes) {
    if (Math.abs(s.duration * model.fps - Math.round(s.duration * model.fps)) > 1e-6) throw Error('Scene duration must be a whole number of frames');
    for (const l of s.layers) if (l.x >= model.width || l.y >= model.height) throw Error('Layer origin is outside the canvas');
  }
  const a = model.music;
  if (a && (a.end <= a.start || a.timelineStart + a.end - a.start > total + 1e-6 || a.fadeIn + a.fadeOut > a.end - a.start)) throw Error('Invalid music trim or fades');
  if (model.audio && (model.audio.start !== undefined || model.audio.end !== undefined)) {
    const { start, end } = model.audio;
    if (start === undefined || end === undefined || end <= start || end - start > total + 1e-6) throw Error('Narration trim requires start/end within the timeline');
  }
  if (model.burnCaptions) {
    const cues = parseSrt(model.srt);
    if (cues.at(-1).end > total + 1e-6) throw Error('Captions extend beyond the timeline');
  }
  return model;
}
function inside(root, file) { const rel = path.relative(root, file); return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel); }
async function rootDirectory(directory = ASSET_ROOT) {
  await fs.mkdir(directory, { recursive: true });
  const root = await fs.realpath(directory);
  // Reject redirected output roots, not just redirected individual assets.
  if (root !== path.resolve(directory)) throw Error('Asset root must not be a symlink');
  return root;
}
export async function resolveAssetPath(value, directory = ASSET_ROOT, assetBoundary = ASSET_ROOT) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || /[\x00-\x1f\\]/.test(value) || /^[a-z][a-z\d+.-]*:/i.test(value)) throw Error('Invalid local asset path');
  const boundary = await rootDirectory(assetBoundary);
  const root = await fs.realpath(directory);
  if (root !== boundary && !inside(boundary, root)) throw Error('Root escapes output/msn-local');
  const requested = path.resolve(root, value);
  if (!inside(root, requested)) throw Error('Asset path escapes output/msn-local');
  const resolved = await fs.realpath(requested);
  if (!inside(root, resolved) || !(await fs.stat(resolved)).isFile()) throw Error('Asset must be a file under output/msn-local');
  return resolved;
}
const xml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const filterPath = p => p.replace(/\\/g, '\\\\').replace(/'/g, "'\\''").replace(/:/g, '\\:');
const formats = { '.mp4': 'mov', '.mov': 'mov', '.m4a': 'mov', '.webm': 'matroska', '.mkv': 'matroska', '.mp3': 'mp3', '.wav': 'wav', '.flac': 'flac', '.ogg': 'ogg' };
const localInput = (file, format) => ['-protocol_whitelist', 'file', '-f', format, '-i', file];
async function mediaDuration(file, signal) {
  let log;
  try { log = await run(['-hide_banner', ...localInput(file, formats[path.extname(file)])], { signal }); }
  catch (error) { signal?.throwIfAborted(); log = error.message; }
  const match = log.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!match) throw Error('Cannot read local media duration');
  return +match[1] * 3600 + +match[2] * 60 + +match[3];
}

/** Build ASS in output pixels, avoiding FFmpeg's default 384x288 subtitle canvas. */
export async function buildCaptionsAss(model) {
  const preset = CAPTION_PRESETS[model.captionPreset], scale = model.height / 1080;
  const size = preset.fontSize * scale, marginV = Math.round(55 * scale);
  const marginX = Math.round(model.width / 16), maxWidth = model.width - 2 * marginX;
  const font = renderFont(preset.bold);
  const widthCache = new Map();
  async function measure(text) {
    if (!widthCache.has(text)) {
      const meta = await sharp({ text: { text: xml(text), font: `${font.font} ${size}`, fontfile: font.fontfile, dpi: 72, rgba: true } }).metadata();
      widthCache.set(text, meta.width);
    }
    return widthCache.get(text);
  }
  const stamp = n => { const c = Math.round(n * 100); return `${Math.floor(c / 360000)}:${String(Math.floor(c / 6000) % 60).padStart(2, '0')}:${String(Math.floor(c / 100) % 60).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`; };
  const tags = [...new Set((model.metadata?.tags ?? []).map(t => t.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = tags.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${tags.map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
  const assColour=c=>c.slice(5,7)+c.slice(3,5)+c.slice(1,3);
  const textColour=assColour(model.captionTextColor||'#ffffff'),highlightColour=assColour(model.captionHighlightColor||'#00ffff');
  const highlight = text => preset.bold && pattern ? text.replace(pattern, match => `{\\c&H00${highlightColour}&}${match}{\\c&H00${textColour}&}`) : text;
  const events = [];
  for (const cue of parseSrt(model.srt)) {
    let lines = [cue.text], widest = await measure(cue.text);
    if (widest > maxWidth) {
      const words = cue.text.split(/\s+/); let best = Infinity;
      for (let i = 1; i < words.length; i++) {
        const pair = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
        const width = Math.max(await measure(pair[0]), await measure(pair[1]));
        if (width < best) { best = width; lines = pair; }
      }
      widest = Math.max(...await Promise.all(lines.map(measure)));
    }
    // Conservative line-height budget keeps outlines and both lines in the bottom quarter.
    const fitted = Math.min(size, size * maxWidth / widest, (model.height / 4 - marginV - 8 * scale) / (lines.length * 1.5));
    if (fitted < 12 * scale) throw Error('Caption cannot fit legibly in two lines');
    const text = lines.map(highlight).join('\\N');
    events.push(`Dialogue: 0,${stamp(cue.start)},${stamp(cue.end)},Default,,0,0,0,,{\\fs${fitted.toFixed(2)}}${text}`);
  }
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${model.width}\nPlayResY: ${model.height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Roboto Condensed,${size},&H00${textColour},&H00${textColour},&H00000000,&H80000000,${preset.bold ? -1 : 0},0,0,0,100,100,0,0,${preset.boxed ? 3 : 1},${2 * scale},0,2,${marginX},${marginX},${marginV},1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`;
}

// Fit complete text inside saved boxes; never crop away the bottom line.
export async function rasterTextLayer(layer,width,height){
 let fontSize=layer.fontSize;
 for(let attempt=0;attempt<8;attempt++){
  const rendered=await sharp({text:{
   text:`<span foreground="${layer.color}">${xml(layer.text)}</span>`,
   font:`${layer.fontFamily === 'sans-serif' ? renderFont(true).font : layer.fontFamily+' Bold'} ${fontSize}`,
   fontfile:renderFont(true).fontfile,dpi:72,width,wrap:'word-char',rgba:true,
  }}).png().toBuffer({resolveWithObject:true});
  if(rendered.info.width<=width&&rendered.info.height<=height)return rendered;
  fontSize=Math.floor(fontSize*Math.min(width/rendered.info.width,height/rendered.info.height)*.98);
  if(fontSize<8)break;
 }
 throw Error('Text does not fit its saved box. Enlarge the text layer or shorten the wording.');
}

export async function renderScenes(input, { signal, onProgress = () => {}, root: directory = ASSET_ROOT, assetBoundary = ASSET_ROOT, replaceDirectory } = {}) {
  const model = validateSceneModel(input), total = model.scenes.reduce((n, s) => n + s.duration, 0);
  const boundary = await rootDirectory(assetBoundary);
  const root = await fs.realpath(directory);
  if (root !== boundary && !inside(boundary, root)) throw Error('Root escapes output/msn-local');
  const tracks = [...(model.audio ? [{ ...model.audio, fadeIn: 0, fadeOut: 0, timelineStart: 0 }] : []), ...(model.music ? [model.music] : [])];
  signal?.throwIfAborted();
  const work = await fs.mkdtemp(path.join(root, '.scene-'));
  let destination = path.join(root, `scene-${randomUUID()}`);
  const replacing = typeof replaceDirectory === 'string' && replaceDirectory.length > 0;
  if (replacing) {
    destination = await fs.realpath(replaceDirectory);
    if (!inside(root, destination) || !/^scene-[0-9a-f-]{36}$/.test(path.basename(destination))) throw Error('Choose an existing local video to update');
    await fs.access(path.join(destination, 'video.mp4'));
  }
  let serial = 0;
  async function copyAsset(value, kind) {
    signal?.throwIfAborted();
    const source = await resolveAssetPath(value, root, assetBoundary), ext = path.extname(source).toLowerCase();
    const allowed = kind === 'image' ? ['.png', '.jpg', '.jpeg', '.webp'] : kind === 'captions' ? ['.srt'] : kind === 'video' ? ['.mp4', '.mov', '.webm', '.mkv'] : ['.wav', '.mp3', '.m4a', '.flac', '.ogg'];
    if (!allowed.includes(ext)) throw Error(`Unsupported ${kind} asset format`);
    const file = path.join(work, `asset-${serial++}${ext}`);
    await fs.copyFile(source, file, fs.constants.COPYFILE_EXCL);
    return file;
  }
  const encode = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '2', '-pix_fmt', 'yuv420p'];
  try {
    for (const [i, scene] of model.scenes.entries()) {
      signal?.throwIfAborted();
      onProgress({ stage: `Rendering scene ${i + 1} of ${model.scenes.length}`, progress: Math.round(i / model.scenes.length * 75) });
      const args = ['-hide_banner', '-y', '-filter_complex_threads', '1'];
      let base;
      if (scene.video) {
        const file = await copyAsset(scene.video.asset, 'video');
        const duration = await mediaDuration(file, signal);
        if (scene.video.start + scene.duration > duration + .01) throw Error('Video scene trim exceeds source duration');
        args.push('-ss', String(scene.video.start), ...localInput(file, formats[path.extname(file)]));
        base = `[0:v]setpts=PTS-STARTPTS,scale=${model.width}:${model.height}:force_original_aspect_ratio=decrease,pad=${model.width}:${model.height}:(ow-iw)/2:(oh-ih)/2:color=${scene.background},setsar=1,fps=${model.fps}[base]`;
      } else {
        args.push('-f', 'lavfi', '-i', `color=c=${scene.background}:s=${model.width}x${model.height}:r=${model.fps}`);
        base = '[0:v]setsar=1[base]';
      }
      const filters = [base]; let previous = 'base';
      for (const [j, layer] of scene.layers.entries()) {
        const file = path.join(work, `layer-${i}-${j}.png`);
        if (layer.type === 'text') {
          const width = layer.width ?? model.width - layer.x;
          const height = layer.height ?? model.height - layer.y;
          const canvas = sharp({ create: { width, height, channels: 4, background: '#00000000' } });
          if (layer.text.trim()) {
            const rendered = await rasterTextLayer(layer,width,height);
            canvas.composite([{ input: rendered.data, left: 0, top: 0 }]);
          }
          await canvas.png().toFile(file);
        } else {
          const source = await copyAsset(layer.asset, 'image');
          // Decode to raster first; untrusted media never becomes a filter expression.
          await sharp(source, { limitInputPixels: 40000000 }).resize(layer.width, layer.height, { fit: layer.fit, background: '#00000000' }).png().toFile(file);
        }
        args.push('-loop', '1', '-framerate', String(model.fps), ...localInput(file, 'image2'));
        const motion=motionFilters(layer.animation,scene.duration);
        filters.push(`[${j+1}:v]${motion.filters}[motion${j}]`);
        filters.push(`[${previous}][motion${j}]overlay=x='${layer.x}+${motion.x}':y='${layer.y}+${motion.y}':enable='${motion.enable}':eval=frame:shortest=1[v${j}]`); previous = `v${j}`;
      }
      args.push('-filter_complex', filters.join(';'), '-map', `[${previous}]`, '-an', '-t', String(scene.duration), '-r', String(model.fps), ...encode, path.join(work, `scene-${i}.mp4`));
      await run(args, { signal });
    }
    await fs.writeFile(path.join(work, 'list.txt'), model.scenes.map((_, i) => `file 'scene-${i}.mp4'`).join('\n'));
    const joined = path.join(work, 'joined.mp4');
    await run(['-y', '-f', 'concat', '-safe', '1', '-protocol_whitelist', 'file', '-i', path.join(work, 'list.txt'), '-c', 'copy', joined], { signal });
    onProgress({ stage: 'Mixing audio and captions', progress: 80 });
    const args = ['-y', '-filter_complex_threads', '1', ...localInput(joined, 'mov'), '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
    const filters = [`[1:a]atrim=duration=${total},asetpts=PTS-STARTPTS[silence]`];
    for (const [i, track] of tracks.entries()) {
      const file = await copyAsset(track.asset, 'audio');
      const sourceDuration = await mediaDuration(file, signal);
      if (track === model.music) {
        if (track.end > sourceDuration + .01) throw Error('Music trim exceeds source duration');
      } else {
        if (track.end === undefined && sourceDuration > total + .01) throw Error('Narration exceeds timeline; provide an explicit start/end trim');
        track.start ??= 0;
        track.end ??= sourceDuration;
        if (track.end > sourceDuration + .01) throw Error('Narration trim exceeds source duration');
      }
      args.push(...localInput(file, formats[path.extname(file)]));
      const duration = track.end - track.start;
      filters.push(`[${i + 2}:a]atrim=start=${track.start}:end=${track.end},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${track.volume},afade=t=in:d=${track.fadeIn},afade=t=out:st=${duration - track.fadeOut}:d=${track.fadeOut},adelay=${Math.round(track.timelineStart * 48000)}S:all=1[a${i}]`);
    }
    filters.push(`[silence]${tracks.map((_, i) => `[a${i}]`).join('')}amix=inputs=${tracks.length + 1}:duration=first:normalize=0:dropout_transition=0[a]`);
    if (model.burnCaptions) {
      const converted = path.join(work, 'captions.ass');
      await fs.writeFile(converted, await buildCaptionsAss(model));
      filters.push(`[0:v]subtitles=filename='${filterPath(converted)}':fontsdir='${filterPath(renderFontsDirectory)}'[v]`);
    }
    const output = path.join(work, 'video.mp4');
    args.push('-filter_complex', filters.join(';'), '-map', model.burnCaptions ? '[v]' : '0:v:0', '-map', '[a]', '-t', String(total), ...encode, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output);
    await run(args, { signal });
    const meta = await probe(output);
    if (meta.width !== model.width || meta.height !== model.height || !meta.audio || Math.abs(meta.duration - total) > .15) throw Error('Scene output validation failed');
    await run(['-v', 'error', ...localInput(output, 'mov'), '-f', 'null', '-'], { signal });
    signal?.throwIfAborted();
    const result = { ...meta, expectedDuration: total, title: model.title, narration: Boolean(model.audio), music: Boolean(model.music), voice: null, requestedVoice: model.audio ? (model.voice ?? null) : null, voiceProvenance: model.audio ? 'unverified' : 'not-applicable', metadata: model.metadata ?? {}, file: path.join(destination, 'video.mp4'), metadataFile: path.join(destination, 'metadata.json'), updatedAt: new Date().toISOString() };
    await fs.writeFile(path.join(work, 'metadata.json'), JSON.stringify(result, null, 2));
    await fs.writeFile(path.join(work, 'model.json'), JSON.stringify(model, null, 2));
    for (const name of await fs.readdir(work)) if (!['video.mp4', 'metadata.json', 'model.json'].includes(name)) await fs.rm(path.join(work, name));
    signal?.throwIfAborted();
    if (replacing) {
      const next = { 'video.mp4': path.join(destination, 'video.next.mp4'), 'metadata.json': path.join(destination, 'metadata.next.json'), 'model.json': path.join(destination, 'model.next.json') };
      try {
        for (const [name, target] of Object.entries(next)) await fs.copyFile(path.join(work, name), target);
        await fs.rename(next['video.mp4'], path.join(destination, 'video.mp4'));
      } catch (error) {
        await Promise.all(Object.values(next).map(file => fs.rm(file, { force: true })));
        throw error;
      }
      await fs.rename(next['metadata.json'], path.join(destination, 'metadata.json')).catch(async () => { await fs.rm(next['metadata.json'], { force: true }); });
      await fs.rename(next['model.json'], path.join(destination, 'model.json')).catch(async () => { await fs.rm(next['model.json'], { force: true }); });
    } else await fs.rename(work, destination);
    return result;
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}

/** Adapter matching the existing local engine job interface. */
export function renderStudio(job, root = ASSET_ROOT, signal, update) {
  const project = job?.request?.project;
  if (!project || typeof project !== 'object') throw Error('A saved scene project is required');
  // Project identity, editorial fields and store timestamps are not render inputs.
  const model = Object.fromEntries(Object.keys(sceneModelSchema.shape).filter(key => project[key] !== undefined).map(key => [key, project[key]]));
  for (const key of ['audio', 'music']) if (model[key] == null || model[key]?.asset === '') delete model[key];
  if (model.metadata) model.metadata = Object.fromEntries(['description', 'tags', 'sourceUrl', 'language'].filter(key => model.metadata[key] !== undefined).map(key => [key, model.metadata[key]]));
  return renderScenes(model, { root, signal, onProgress: update, replaceDirectory: job.request?.replaceDirectory });
}
