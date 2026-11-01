import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {approveThumbnail,assignThumbnail,restoreThumbnail,chooseFrame,libraryDetails,createStudioPlaylist,addStudioVideo,analyticsForVideos,applyPlayerPoster,videoLibraryView,namedBrand,videoKind} from './video-library.mjs';
import {run} from './engine.mjs';
import sharp from 'sharp';

test('frame choice skips black and green-screen samples',()=>{
 const chosen=chooseFrame([{seconds:.2,mean:4,r:4,g:4,b:4},{seconds:.5,mean:80,r:20,g:140,b:20},{seconds:.8,mean:42,r:40,g:44,b:48}]);
 assert.equal(chosen.seconds,.8);
});
test('library details reject an empty title and keep supplied tags',()=>{
 assert.throws(()=>libraryDetails({title:'  '}),/Enter a title/);
 assert.deepEqual(libraryDetails({title:'Match report',description:'',tags:[' Football ','Football'],language:'en'}).tags,['Football']);
});
test('thumbnail approval keeps the previous image and restore swaps it back',()=>{
 const saved=approveThumbnail({asset:'old.jpg',listAsset:'old.webp',seconds:1,source:'capture',updatedAt:'2026-11-01T00:00:00.000Z'},{asset:'new.jpg',listAsset:'new.webp',seconds:4,source:'capture'},'2026-11-01T01:00:00.000Z');
 assert.equal(saved.asset,'new.jpg');assert.equal(saved.previous.asset,'old.jpg');
 const restored=restoreThumbnail(saved,'2026-11-01T02:00:00.000Z');
 assert.equal(restored.asset,'old.jpg');assert.equal(restored.previous.asset,'new.jpg');
 assert.throws(()=>restoreThumbnail({asset:'only.jpg',listAsset:'only.webp'},'2026-11-01T03:00:00.000Z'),/no previous/);
});
test('an internal playlist can hold completed videos without publishing them',()=>{
 const state={jobs:[{id:'job',status:'complete',output:{asset:'videos/a.mp4'}}],studioPlaylists:[]};
 const playlist=createStudioPlaylist(state,{title:'Football365 LIVE',brand:'Football365'},'p1','2026-11-01T00:00:00.000Z');
 addStudioVideo(state,playlist.id,'job','2026-11-01T00:00:01.000Z');
 assert.throws(()=>addStudioVideo(state,playlist.id,'job','2026-11-01T00:00:02.000Z'),/already/);
 assert.throws(()=>createStudioPlaylist(state,{title:'Football365 LIVE',brand:'Football365'},'p2','2026-11-01T00:00:03.000Z'),/already exists/);
 assert.equal(state.websiteVideos,undefined);
});
test('player poster replacement is explicit and analytics stay empty when untracked',()=>{
 const state={assets:{'thumb.jpg':{sha256:'abc'}},websiteVideos:[{id:'video',jobId:'job',destinationId:'football365',status:'published',posterAsset:'old.png',posterHash:'old'}]};
 assert.throws(()=>applyPlayerPoster(state,'missing',{asset:'thumb.jpg',updatedAt:'2026-11-01T00:00:00.000Z'}));
 const applied=applyPlayerPoster(state,'job',{asset:'thumb.jpg',updatedAt:'2026-11-01T00:00:00.000Z'});
 assert.equal(applied.destinationId,'football365');assert.equal(state.websiteVideos[0].posterHash,'abc');
 assert.equal(analyticsForVideos([],[]).available,false);
 assert.deepEqual(analyticsForVideos([{videoId:'video',event:'start'},{videoId:'video',event:'complete'}],['video']),{available:true,loads:0,starts:1,completions:1,completionRate:100,averageWatchTime:null,playbackErrors:null,adImpressions:null});
});
test('status labels use a named brand and file role, and leave an unnamed video blank',()=>{
 assert.equal(namedBrand('Football365_Intro_1920x1080.mp4'),'Football365');
 assert.equal(namedBrand('PlanetF1_Outro_1920x1080.mp4'),'PlanetF1');
 assert.equal(namedBrand('TEAMtalk_Transition_1920x1080.mp4'),'TEAMtalk');
 assert.equal(namedBrand('Saved title'),'');
 assert.equal(videoKind('Football365_Intro_1920x1080.mp4','Upload'),'Intro');
 assert.equal(videoKind('Football365-Daniel-Brooks-V2-Listening.mp4','Upload'),'Presenter');
 assert.equal(videoKind('Football365-Carrick-Version-B-Intro-Outro.mp4','Upload'),'Intro and outro');
 assert.equal(videoKind('Review · news-article','Studio'),'Studio video');
});
test('library view reads stored articles and does not invent a brand',()=>{
 const view=videoLibraryView({jobs:[{id:'job',status:'complete',createdAt:'2026-10-30T12:00:00.000Z',output:{asset:'videos/a.mp4',url:'/media',title:'Saved title',duration:12,updatedAt:'2026-10-30T13:00:00.000Z'},request:{kind:'studio',projectId:'project',project:{sourceUrl:'https://www.football365.com/news/story',title:'Story'}}}],assets:{},websiteVideos:[],playerDestinations:[],thumbnails:{},videoDetails:{}});
 assert.equal(view.finished[0].brand,'');
 assert.equal(view.finished[0].articles[0].url,'https://www.football365.com/news/story');
 assert.equal(view.finished[0].createdAt,'2026-10-30T12:00:00.000Z');
});
test('a missing thumbnail is saved once and an existing one is left in place',()=>{
 const captured={key:'file:videos/a.mp4',draft:{asset:'thumbnails/new.jpg',listAsset:'thumbnails/new.webp',seconds:1.2,source:'suggested'},entries:[{asset:'thumbnails/new.jpg',sha256:'abc'}]};
 const state={thumbnails:{},assets:{},websiteVideos:[{id:'video',jobId:'job',posterAsset:'old.png',posterHash:'old'}]};
 const saved=assignThumbnail(state,captured,'2026-11-01T04:00:00.000Z');
 assert.equal(saved.skipped,false);assert.equal(state.thumbnails[captured.key].source,'suggested');assert.equal(state.thumbnails[captured.key].updatedAt,'2026-11-01T04:00:00.000Z');
 assert.equal(state.websiteVideos[0].posterAsset,'old.png');
 assert.equal(assignThumbnail(state,captured,'2026-11-01T05:00:00.000Z').skipped,true);
 assert.equal(state.thumbnails[captured.key].updatedAt,'2026-11-01T04:00:00.000Z');
});
test('server extraction writes the video frame rather than a player screenshot',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'plexa-frame-'));
 const file=path.join(dir,'sample.mp4');
 await run(['-hide_banner','-y','-f','lavfi','-i','color=c=0x2244aa:s=320x180:r=30','-t','1','-pix_fmt','yuv420p',file]);
 const {captureVideoFrame}=await import('./video-thumbnail.mjs');
 const bytes=await fs.readFile(file);
 const stored=[];
 const workspace={snapshot:async()=>({state:{jobs:[{id:'job',status:'complete',output:{asset:'videos/sample.mp4',duration:1}}],assets:{'videos/sample.mp4':{asset:'videos/sample.mp4'}}}}),getFile:async()=>({bytes}),putBytes:async(asset,body)=>(stored.push({asset,body}),{asset,sha256:'hash',bytes:body.length})};
 const result=await captureVideoFrame(workspace,{jobId:'job',seconds:0.4});
 const meta=await sharp(stored.find(item=>item.asset.endsWith('.jpg')).body).metadata();
 assert.equal(meta.width,320);assert.equal(meta.height,180);assert.equal(result.draft.source,'capture');assert.equal(result.draft.seconds,0.4);
 const {suggestVideoFrame}=await import('./video-thumbnail.mjs');
 const upload={snapshot:async()=>({state:{jobs:[],assets:{'uploads/sample.mp4':{asset:'uploads/sample.mp4'}}}}),getFile:async()=>({bytes}),putBytes:async(asset,body)=>({asset,sha256:'hash',bytes:body.length})};
 const suggested=await suggestVideoFrame(upload,{asset:'uploads/sample.mp4'});
 assert.equal(suggested.key,'file:uploads/sample.mp4');assert.equal(suggested.draft.source,'suggested');assert.ok(suggested.draft.seconds>=0);
 await fs.rm(dir,{recursive:true,force:true});
});
