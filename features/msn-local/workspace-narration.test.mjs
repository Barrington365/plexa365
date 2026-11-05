import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {diskObjectStore} from './disk-object-store.mjs';import {createWorkspaceStore} from './workspace-store.mjs';import {queueWorkspaceNarration,runWorkspaceNarration} from './workspace-narration.mjs';
import {TEAMTALK_LIVE_TEMPLATE} from './teamtalk-live.mjs';import {run} from './engine.mjs';
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-narration-'));try{const w=createWorkspaceStore(diskObjectStore(root)),p=await w.projects.create('player-club',{title:'Narration test',script:'Hello.',width:320,height:180,fps:10,scenes:[{id:'s',duration:2,background:'#000000',layers:[]}],burnCaptions:false});await run(['-y','-f','lavfi','-i','sine=frequency=440','-t','1','-c:a','libmp3lame',path.join(root,'test.mp3')]);await fn(w,p,await fs.readFile(path.join(root,'test.mp3')));}finally{await fs.rm(root,{recursive:true,force:true});}}
const voiceResponse=()=>Response.json({voices:[{voice_id:'custom-sam',name:'Account Sam',category:'cloned'}],has_more:false});
const body=p=>({projectId:p.id,voiceId:'custom-sam',expectedUpdatedAt:p.updatedAt});
test('account voice reaches provider, timestamped captions match stored audio, and explicit captions-off preference survives',()=>fixture(async(w,p,audio)=>{let requests=0;const fetcher=async(url,options)=>{if(String(url).includes('/v2/voices'))return voiceResponse();requests++;assert.match(String(url),/custom-sam\/with-timestamps/);assert.equal(JSON.parse(options.body).text,'Hello.');return Response.json({audio_base64:audio.toString('base64'),alignment:{characters:[...'Hello.'],character_start_times_seconds:[0,.1,.2,.3,.4,.5],character_end_times_seconds:[.1,.2,.3,.4,.5,.6]}});};const job=await queueWorkspaceNarration(w,body(p),'user');await runWorkspaceNarration(w,job.id,'test-key',fetcher);const saved=await w.projects.get(p.id);assert.equal(saved.elevenlabsVoiceId,'custom-sam');assert.equal(saved.burnCaptions,false);assert.match(saved.srt,/Hello\./);assert.ok(saved.audio.asset.startsWith('narration/'));assert.equal((await w.snapshot()).state.jobs[0].status,'complete');assert.equal(requests,1);}));
test('unknown provider outcome is durable and blocks a second paid request across worker instances',()=>fixture(async(w,p)=>{let requests=0;const fetcher=async url=>{if(String(url).includes('/v2/voices'))return voiceResponse();requests++;throw Error('connection lost');};const first=await queueWorkspaceNarration(w,body(p),'user');await assert.rejects(runWorkspaceNarration(w,first.id,'test-key',fetcher),/connection lost/);const second=await queueWorkspaceNarration(w,body(p),'user');await assert.rejects(runWorkspaceNarration(w,second.id,'test-key',fetcher),/unresolved/);assert.equal(requests,1);}));
test('unavailable account voice fails visibly before generation',()=>fixture(async(w,p)=>{const job=await queueWorkspaceNarration(w,{...body(p),voiceId:'restricted-library-voice'},'user');let tts=0;const fetcher=async url=>{if(String(url).includes('/v2/voices'))return voiceResponse();tts++;throw Error('must not generate');};await assert.rejects(runWorkspaceNarration(w,job.id,'test-key',fetcher),/unavailable/);assert.equal(tts,0);}));
test('TEAMtalk narration speaks Daniel and Maya separately and does not charge either voice twice',()=>fixture(async(w,_,audio)=>{
 const created=await w.projects.create(TEAMTALK_LIVE_TEMPLATE,{title:'TEAMtalk LIVE — Dual Presenter Test 001'});
 const script='Daniel: Chelsea will keep Colwill.\n\nMaya: United are watching Sesko.\n\nDaniel: Kane stays at Bayern.';
 const video={asset:'uploads/studio.mp4',start:0,loop:true};
 const clip=(id,x)=>({id,type:'clip',asset:'',x,y:300,width:330,height:760,loop:true,chroma:'#00d600'});
 const saved=await w.projects.save(created.id,{script,fps:30,scenes:[
  {id:'intro',duration:1,background:'#060d15',video:{asset:'uploads/intro.mp4',start:0},layers:[]},
  {id:'colwill',duration:1,background:'#060d15',video,layers:[{id:'club-crest',type:'logo',asset:'uploads/chelsea.png',x:95,y:358,width:349,height:250,fit:'contain'},clip('daniel-left',500),clip('maya-right',1040)]},
  {id:'sesko',duration:1,background:'#060d15',video,layers:[{id:'article-image',type:'image',asset:'images/sesko.png',x:1389,y:203,width:436,height:509,fit:'contain'}]},
  {id:'kane',duration:1,background:'#060d15',video,layers:[{id:'club-crest',type:'logo',asset:'',x:95,y:358,width:349,height:250,fit:'contain'},{id:'article-image',type:'image',asset:'images/kane.png',x:1389,y:203,width:436,height:509,fit:'contain'}]},
  {id:'outro',duration:1,background:'#060d15',video:{asset:'uploads/outro.mp4',start:0},layers:[]},
 ]},created.updatedAt);
 await w.update(s=>{for(const [asset,name] of [['uploads/daniel-presenting.mp4','Football365-Daniel-Brooks-V2-Presenting.mp4'],['uploads/daniel-listening.mp4','Football365-Daniel-Brooks-Listening.mp4'],['uploads/maya-presenting.mp4','Football365-Maya-Bennett-Presenting.mp4'],['uploads/maya-listening.mp4','Football365-Maya-Bennett-Listening.mp4']])s.assets[asset]={asset,name,bytes:1,sha256:'a'.repeat(64),chunks:[]};return true;});
 const calls=[];
 const alignment=text=>{const n=text.length,step=.8/n;return {characters:[...text],character_start_times_seconds:[...text].map((_,i)=>i*step),character_end_times_seconds:[...text].map((_,i)=>(i+1)*step)};};
 const fetcher=async(url,options)=>{if(String(url).includes('/v2/voices'))return Response.json({voices:[{voice_id:'2yqdQ7uuPQDBMgFA8dgu',name:'Planet F1 - Male - Sam',category:'cloned'},{voice_id:'ZF6FPAbjXT4488VcRRnw',name:'Amelia - Enthusiastic and Expressive',category:'professional'}],has_more:false});const body=JSON.parse(options.body);calls.push({url:String(url),text:body.text,settings:body.voice_settings});return Response.json({audio_base64:audio.toString('base64'),alignment:alignment(body.text)});};
 const job=await queueWorkspaceNarration(w,{projectId:saved.id,voiceId:'ZF6FPAbjXT4488VcRRnw',expectedUpdatedAt:saved.updatedAt},'user');
 await runWorkspaceNarration(w,job.id,'test-key',fetcher);
 const project=await w.projects.get(saved.id);
 assert.equal(calls.length,2);
 assert.match(calls[0].url,/2yqdQ7uuPQDBMgFA8dgu/);
 assert.deepEqual(calls[0].settings,{speed:1.06,stability:0.38,style:0.35,similarity_boost:0.75,use_speaker_boost:false});
 assert.deepEqual(calls[1].settings,{speed:1.14,stability:0.32,style:0.48,similarity_boost:0.75,use_speaker_boost:false});
 assert.match(calls[0].text,/Chelsea will keep Colwill/);
 assert.match(calls[0].text,/Kane stays at Bayern/);
 assert.doesNotMatch(calls[0].text,/Sesko/);
 assert.match(calls[1].url,/ZF6FPAbjXT4488VcRRnw/);
 assert.equal(calls[1].text,'United are watching Sesko.');
 assert.equal(project.elevenlabsVoiceId,'');
 assert.match(project.voice,/Planet F1 - Male - Sam/);
 assert.match(project.voice,/Amelia - Enthusiastic and Expressive/);
 assert.doesNotMatch(project.srt,/Daniel:|Maya:/);
 assert.equal(project.scenes[1].layers.find(layer=>layer.id==='daniel-left').asset,'uploads/daniel-presenting.mp4');
 assert.equal(project.scenes[2].layers.find(layer=>layer.id==='maya-right').asset,'uploads/maya-presenting.mp4');
 assert.equal(project.scenes[2].layers.find(layer=>layer.id==='article-image').asset,'images/sesko.png');
 assert.equal(project.scenes[3].layers.find(layer=>layer.id==='club-crest').asset,'images/kane.png');
 assert.equal(project.scenes[3].layers.find(layer=>layer.id==='article-image').asset,'images/kane.png');
 const retry=await queueWorkspaceNarration(w,{projectId:project.id,voiceId:'ZF6FPAbjXT4488VcRRnw',expectedUpdatedAt:project.updatedAt},'user');
 await runWorkspaceNarration(w,retry.id,'test-key',fetcher);
 assert.equal(calls.length,2);
}));
