import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { run } from './engine.mjs';
import { ASSET_ROOT, SCENE_MODEL_SCHEMA, validateSceneModel, resolveAssetPath, renderStudio, buildCaptionsAss, rasterTextLayer } from './scene-renderer.mjs';
const project = () => ({ width: 320, height: 180, fps: 10, scenes: [{ id: 'one', duration: .5, background: '#ff0000', layers: [] }] });
async function fixture(fn) {
  await fs.mkdir(ASSET_ROOT, { recursive: true });
  const root = await fs.mkdtemp(path.join(ASSET_ROOT, 'scene-test-'));
  try { await fn(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
test('flat schema defaults, validation, exported JSON schema', () => {
  assert.equal(SCENE_MODEL_SCHEMA.type, 'object');
  assert.equal(validateSceneModel(project()).audio, undefined);
  for (const patch of [{ scenes: [] }, { width: 321 }, { burnCaptions: true }, { music: { asset: 'a.wav', start: 2, end: 1 } }, { scenes: [{ duration: .25 }] }]) assert.throws(() => validateSceneModel({ ...project(), ...patch }));
});
test('rejects remote, traversal, symlink escape and unsupported media', () => fixture(async root => {
  for (const value of ['https://example.org/a.png', '../escape.png', '/etc/passwd', 'file:/etc/passwd']) await assert.rejects(resolveAssetPath(value, root));
  await fs.symlink('/etc/passwd', path.join(root, 'escape.png'));
  await assert.rejects(resolveAssetPath('escape.png', root));
  await fs.writeFile(path.join(root, 'playlist.m3u8'), '#EXTM3U');
  const p = project(); p.scenes[0].video = { asset: 'playlist.m3u8' };
  await assert.rejects(renderStudio({ request: { project: p } }, root), /Unsupported/);
  assert.deepEqual((await fs.readdir(root)).sort(), ['escape.png', 'playlist.m3u8']);
}));
test('renders actual image, logo, literal text, video, narration, music and SRT fixture', () => fixture(async root => {
  await sharp({ create: { width: 40, height: 40, channels: 4, background: '#00ff00' } }).png().toFile(path.join(root, 'logo.png'));
  await run(['-y', '-f', 'lavfi', '-i', 'color=blue:s=320x180:r=10', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(root, 'clip.mp4')]);
  await run(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1', path.join(root, 'voice.wav')]);
  const p = project();
  p.scenes[0].layers = [
    { id: 'image', type: 'image', asset: 'logo.png', x: 10, y: 10, width: 40, height: 40 },
    { id: 'logo', type: 'logo', asset: 'logo.png', x: 270, y: 10, width: 30, height: 30 },
    { id: 'text', type: 'text', text: "Local <test> : ' % ", x: 60, y: 20, fontSize: 18, color: '#ffffff' },
  ];
  p.scenes.push({ id: 'two', duration: .5, background: '#000000', video: { asset: 'clip.mp4', start: .2 }, layers: [] });
  p.audio = { asset: 'voice.wav', volume: .5 }; p.music = { asset: 'voice.wav', start: .1, end: .8, volume: .1, fadeIn: .1, fadeOut: .2 };
  p.srt = '1\n00:00:00,000 --> 00:00:00,900\nLocal caption\n'; p.burnCaptions = true; p.captionPreset = 'boxed';
  p.voice = 'Fixture tone'; p.metadata = { description: 'Test', tags: ['fixture'], sourceUrl: 'https://example.org/reference-only', language: 'en' };
  const result = await renderStudio({ request: { project: p } }, root);
  assert.equal(result.width, 320); assert.equal(result.height, 180); assert.ok(Math.abs(result.duration - 1) < .1);
  assert.equal(result.narration, true); assert.equal(result.voice, null); assert.equal(result.requestedVoice, 'Fixture tone'); assert.equal(result.voiceProvenance, 'unverified');
  assert.equal(JSON.parse(await fs.readFile(result.metadataFile)).updatedAt, result.updatedAt);
  assert.deepEqual((await fs.readdir(path.dirname(result.file))).sort(), ['metadata.json', 'model.json', 'video.mp4']);
  const audio = await run(['-i', result.file, '-af', 'volumedetect', '-f', 'null', '-']); assert.doesNotMatch(audio, /mean_volume: -91/);
  // Decode a real frame and verify image placement and background, not just the container.
  const frame = path.join(root, 'frame.png');
  await run(['-y', '-i', result.file, '-frames:v', '1', frame]);
  const { data, info } = await sharp(frame).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
  assert.ok(pixel(20, 20)[1] > 180); assert.ok(pixel(2, 2)[0] > 180);
}));
test('missing audio produces silent output and no voice claim; burn switch ignores SRT', () => fixture(async root => {
  const p = { ...project(), id: 'saved-id', templateId: 'news-article', updatedAt: '2026-01-01T00:00:00.000Z', audio: { asset: '', volume: 1 }, music: { asset: '', start: 0, end: 0, volume: 1, fadeIn: 0, fadeOut: 0 }, voice: 'Unverified voice', srt: 'not SRT', burnCaptions: false };
  const result = await renderStudio({ request: { project: p } }, root);
  assert.equal(result.narration, false); assert.equal(result.voice, null);
  assert.match(await run(['-i', result.file, '-af', 'volumedetect', '-f', 'null', '-']), /mean_volume: -91/);
}));
test('failure and cancellation publish nothing and remove work files', () => fixture(async root => {
  const controller = new AbortController();
  const p = project();
  await assert.rejects(renderStudio({ request: { project: p } }, root, controller.signal, () => controller.abort()));
  assert.deepEqual(await fs.readdir(root), []);
  p.scenes[0].layers = [{ type: 'image', asset: 'missing.png', x: 0, y: 0, width: 10, height: 10 }];
  await assert.rejects(renderStudio({ request: { project: p } }, root));
  assert.deepEqual(await fs.readdir(root), []);
}));

test('null track defaults are omitted by the saved-project adapter', () => fixture(async root => {
  const result = await renderStudio({ request: { project: { ...project(), audio: null, music: null, voice: 'Not recorded' } } }, root);
  assert.equal(result.narration, false); assert.equal(result.music, false); assert.equal(result.voice, null);
  const saved = JSON.parse(await fs.readFile(path.join(path.dirname(result.file), 'model.json')));
  assert.equal(saved.audio, undefined); assert.equal(saved.music, undefined);
  assert.match(await run(['-i', result.file, '-af', 'volumedetect', '-f', 'null', '-']), /mean_volume: -91/);
}));

test('burned SRT must be valid, nonoverlapping and end within the timeline', () => fixture(async root => {
  for (const srt of [
    'not SRT',
    '1\n00:00:00,000 --> 00:00:00,501\nBeyond timeline',
    '1\n00:00:00,200 --> 00:00:00,100\nReversed',
    '1\n00:00:00,000 --> 00:00:00,300\nFirst\n\n2\n00:00:00,200 --> 00:00:00,400\nOverlap',
    '1\n00:00:00,000 --> 00:00:00,400\n',
  ]) await assert.rejects(renderStudio({ request: { project: { ...project(), burnCaptions: true, srt } } }, root));
  assert.deepEqual(await fs.readdir(root), []);
  const srt = '1\n00:00:00,000 --> 00:00:00,500\nExact end';
  assert.equal(validateSceneModel({ ...project(), burnCaptions: true, srt }).srt, srt);
}));

test('narration cannot silently clip; explicit source trims render and invalid trims fail', () => fixture(async root => {
  await run(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1', path.join(root, 'voice.wav')]);
  const p = { ...project(), audio: { asset: 'voice.wav', volume: 1 } };
  await assert.rejects(renderStudio({ request: { project: p } }, root), /Narration exceeds timeline/);
  assert.deepEqual(await fs.readdir(root), ['voice.wav']);
  for (const trim of [{ start: .2 }, { end: .4 }, { start: .4, end: .2 }, { start: 0, end: .6 }, { start: .8, end: 1.2 }]) {
    await assert.rejects(renderStudio({ request: { project: { ...p, audio: { ...p.audio, ...trim } } } }, root), /Narration trim/);
  }
  p.audio = { ...p.audio, start: .2, end: .6 };
  const result = await renderStudio({ request: { project: p } }, root);
  assert.ok(Math.abs(result.duration - .5) < .1);
  assert.doesNotMatch(await run(['-i', result.file, '-af', 'volumedetect', '-f', 'null', '-']), /mean_volume: -91/);
  // Untrimmed short narration is allowed, with silence to the timeline end.
  p.scenes[0].duration = 1.5; p.audio = { asset: 'voice.wav' };
  const padded = await renderStudio({ request: { project: p } }, root);
  assert.match(await run(['-i', padded.file, '-af', 'atrim=start=1.2:end=1.4,volumedetect', '-f', 'null', '-']), /mean_volume: -91/);
}));

test('music timelineStart delays the trimmed source independently, rejects overflow', () => fixture(async root => {
  await run(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-af', "volume=0:enable='lt(t,0.4)'", '-t', '1', path.join(root, 'music.wav')]);
  const p = project(); p.scenes[0].duration = 1;
  p.music = { asset: 'music.wav', start: .5, end: .8, timelineStart: .5, volume: .5, fadeIn: .02, fadeOut: .02 };
  for (const timelineStart of [-.1, .8, NaN]) assert.throws(() => validateSceneModel({ ...p, music: { ...p.music, timelineStart } }));
  const result = await renderStudio({ request: { project: p } }, root);
  const measure = (start, end) => run(['-i', result.file, '-af', `atrim=start=${start}:end=${end},volumedetect`, '-f', 'null', '-']);
  assert.match(await measure(.1, .3), /mean_volume: -91/);
  assert.doesNotMatch(await measure(.58, .7), /mean_volume: -91/);
  assert.match(await measure(.9, .98), /mean_volume: -91/);
  const saved = JSON.parse(await fs.readFile(path.join(path.dirname(result.file), 'model.json')));
  assert.equal(saved.music.timelineStart, .5); assert.equal(saved.music.start, .5);
}));

test('text wraps inside width, clips to height, and preserves explicit newlines', () => fixture(async root => {
  const p = project(); p.scenes[0].background = '#000000';
  p.scenes[0].layers = [{ type: 'text', text: 'MMMM MMMM\nMMMM', x: 10, y: 10, width: 85, height: 60, fontSize: 20, fontFamily: 'sans-serif', color: '#ffffff' }];
  const result = await renderStudio({ request: { project: p } }, root);
  const frame = path.join(root, 'wrapped.png'); await run(['-y', '-i', result.file, '-frames:v', '1', frame]);
  const { data, info } = await sharp(frame).raw().toBuffer({ resolveWithObject: true });
  const bright = (x, y) => data[(y * info.width + x) * info.channels] > 150;
  const count = (x0, y0, x1, y1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) n += bright(x, y); return n; };
  assert.ok(count(10, 10, 95, 32) > 30, 'first line is visible');
  assert.ok(count(10, 33, 95, 55) > 30, 'width forces a second line');
  assert.ok(count(10, 56, 95, 70) > 10, 'explicit newline remains a third line');
  assert.equal(count(96, 0, 320, 180), 0, 'no horizontal overflow');
  assert.equal(count(0, 71, 320, 180), 0, 'height clips overflow');
}));

test('1080p captions stay in bottom quarter, use two lines and highlight bold tags cyan', () => fixture(async root => {
  const text = 'Alexis Mac Allister and Liverpool return to the spotlight with fresh transfer news';
  for (const captionPreset of ['standard', 'bold', 'boxed']) {
    const p = validateSceneModel({ width: 1920, height: 1080, fps: 10,
      scenes: [{ duration: .5, background: '#000000', layers: [] }],
      burnCaptions: true, captionPreset, srt: `1\n00:00:00,000 --> 00:00:00,500\n${text}`,
      metadata: { tags: ['Liverpool', 'Mac Allister', '[test]'] },
    });
    const ass = await buildCaptionsAss(p);
    assert.match(ass, /PlayResX: 1920\nPlayResY: 1080/);
    const dialogue = ass.split('\n').find(line => line.startsWith('Dialogue:'));
    assert.ok((dialogue.match(/\\N/g) ?? []).length <= 1);
    const result = await renderStudio({ request: { project: p } }, root);
    const frame = path.join(root, `${captionPreset}.png`);
    await run(['-y', '-ss', '0.2', '-i', result.file, '-frames:v', '1', frame]);
    const { data, info } = await sharp(frame).raw().toBuffer({ resolveWithObject: true });
    let above = 0, bottom = 0, cyan = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (Math.max(data[i], data[i + 1], data[i + 2]) > 100) { if (y < 810) above++; else bottom++; }
      if (data[i] < 90 && data[i + 1] > 150 && data[i + 2] > 150) cyan++;
    }
    assert.equal(above, 0, `${captionPreset}: no captions above bottom quarter`);
    assert.ok(bottom > 1000, `${captionPreset}: captions actually burned`);
    assert.ok(captionPreset === 'bold' ? cyan > 100 : cyan === 0, 'cyan only in bold keyword highlights');
  }
}));

test('two-line headlines fit saved boxes without cropping the final line',async()=>{
 const layer={text:'ALEXIS\nMAC ALLISTER',color:'#ffffff',fontFamily:'sans-serif',fontSize:64};
 const result=await rasterTextLayer(layer,760,110);
 assert.ok(result.info.width<=760);assert.ok(result.info.height<=110);
 const {data,info}=await sharp(result.data).raw().toBuffer({resolveWithObject:true});
 const occupied=[];for(let y=0;y<info.height;y++){let row=false;for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>128){row=true;break;}occupied.push(row);}
 let groups=0;for(let y=0;y<occupied.length;y++)if(occupied[y]&&!occupied[y-1])groups++;
 assert.equal(groups,2,'both complete lines remain in the output');
 await assert.rejects(rasterTextLayer({...layer,text:'Too much text for a tiny box'},5,2),/does not fit/);
});
test('music ducking attenuates music during narration and recovers in speech pauses',()=>fixture(async root=>{
 await run(['-y','-f','lavfi','-i','sine=frequency=220:sample_rate=48000','-af',"volume=4,volume=0:enable='gte(t,1)'",'-t','3',path.join(root,'voice.wav')]);
 await run(['-y','-f','lavfi','-i','sine=frequency=2000:sample_rate=48000','-t','3',path.join(root,'music.wav')]);
 const p={...project(),scenes:[{duration:3,background:'#000000',layers:[]}],audio:{asset:'voice.wav'},music:{asset:'music.wav',end:3,volume:.2}};
 const normal=await renderStudio({request:{project:p}},root);p.music.ducking=true;const ducked=await renderStudio({request:{project:p}},root);
 async function level(file,start,end){const log=await run(['-hide_banner','-i',file,'-af',`atrim=start=${start}:end=${end},bandpass=f=2000:t=h:w=100,volumedetect`,'-vn','-f','null','-']);return Number(log.match(/mean_volume: ([\d.-]+) dB/)[1]);}
 const original=await level(normal.file,.3,.8),during=await level(ducked.file,.3,.8),after=await level(ducked.file,2.5,2.9);assert.ok(during<original-5,`expected ducking: ${during} vs ${original}`);assert.ok(after>during+4,`expected recovery: ${after} vs ${during}`);
}));

test('captions retain global timing across scene cuts and disappear after the final cue',()=>fixture(async root=>{
 const p={width:640,height:360,fps:30,scenes:[{duration:1,background:'#000000',layers:[]},{duration:1,background:'#000000',layers:[]}],burnCaptions:true,captionPreset:'bold',metadata:{tags:['Arsenal']},srt:'1\n00:00:00,700 --> 00:00:01,300\nArsenal cross the cut.\n\n2\n00:00:01,500 --> 00:00:01,800\nThe final sentence.'};
 const result=await renderStudio({request:{project:p}},root);
 for(const [time,present] of [[.4,false],[.9,true],[1.1,true],[1.4,false],[1.6,true],[1.9,false]]){
  const frame=path.join(root,`cue-${time}.png`);await run(['-y','-ss',String(time),'-i',result.file,'-frames:v','1',frame]);
  const data=await sharp(frame).raw().toBuffer();assert.equal(data.some(v=>v>120),present,`caption visibility at ${time}s`);
 }
}));
