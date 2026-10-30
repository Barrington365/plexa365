import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createWorkspaceStore} from './workspace-store.mjs';import {diskObjectStore} from './disk-object-store.mjs';import {run} from './engine.mjs';
import {queueVoiceReview,runVoiceReview,readVoiceReview,reviewVoiceCandidate,selectVoicePreset,applyVoiceCandidate,sentenceSpans} from './voice-review.mjs';
import {parseSrt} from './article.mjs';
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'audition-test-'));try{const w=createWorkspaceStore(diskObjectStore(root));const p=await w.projects.create('player-club',{title:'Carrick reference',script:'Hello. Next.',width:320,height:180,fps:10,scenes:[{id:'s',duration:5,background:'#000000',layers:[]}],burnCaptions:false});await run(['-y','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:a','libmp3lame',path.join(root,'tone.mp3')]);const audio=await fs.readFile(path.join(root,'tone.mp3'));let requests=[];const fetcher=async(url,options)=>{if(String(url).includes('/v2/voices'))return Response.json({voices:[{voice_id:'sam',name:'Account Sam',category:'cloned'}],has_more:false});const q=JSON.parse(options.body);requests.push(q);return Response.json({audio_base64:audio.toString('base64'),alignment:{characters:[...q.text],character_start_times_seconds:[...q.text].map((_,i)=>i*.08),character_end_times_seconds:[...q.text].map((_,i)=>(i+1)*.08)}});};await fn(w,p,fetcher,requests,root);}finally{await fs.rm(root,{recursive:true,force:true});}}
const body=p=>({projectId:p.id,expectedUpdatedAt:p.updatedAt,voiceId:'sam',factsReviewed:true,settings:{pause:.2}});
const make=async(w,p,f,b={})=>{const j=await queueVoiceReview(w,{...body(p),...b},'editor');await runVoiceReview(w,j.id,'test-key',f);return (await readVoiceReview(w,p.id)).candidates.at(-1);};
test('audition persists playable audio with timed captions and leaves original project exactly unchanged',()=>fixture(async(w,p,f,requests,root)=>{const original=await w.projects.get(p.id),c=await make(w,p,f);assert.deepEqual(await w.projects.get(p.id),original);assert.equal(c.status,'awaiting-editor');assert.equal(c.segments.length,2);assert.equal(requests[0].voice_settings.use_speaker_boost,false);assert.equal(requests[0].text,p.script);assert.ok(c.segments[1].timelineStart>=.76);const cues=parseSrt(c.srt);assert.ok(cues.at(-1).end<c.duration);const file=path.join(root,'saved.mp3');await fs.writeFile(file,(await w.getFile(c.asset)).bytes);await run(['-v','error','-i',file,'-f','null','-']);const another=createWorkspaceStore(diskObjectStore(root));assert.equal((await readVoiceReview(another,p.id)).candidates.length,1);assert.equal((await another.getFile(c.asset)).bytes.length,(await w.getFile(c.asset)).bytes.length);}));
test('sentence regeneration sends only requested sentence plus context and preserves all other segment references',()=>fixture(async(w,p,f,requests)=>{const c=await make(w,p,f);const next=await make(w,p,f,{parentId:c.id,sentenceIndex:1,sentenceText:'Next.',settings:{speed:1.1,pause:.3},profile:'presenter'});assert.equal(requests.length,2);assert.equal(requests[1].text.trim(),'Next.');assert.equal(requests[1].previous_text,'Hello. ');assert.deepEqual(next.segments[0],c.segments[0]);assert.notEqual(next.asset,c.asset);assert.equal((await w.projects.get(p.id)).audio.asset,'');assert.equal((await readVoiceReview(w,p.id)).candidates.length,2);}));
test('editor review and selection are required; selected preset alone cannot change production',()=>fixture(async(w,p,f)=>{const c=await make(w,p,f);await assert.rejects(selectVoicePreset(w,{projectId:p.id,candidateId:c.id},'editor'),/Compare/);await assert.rejects(applyVoiceCandidate(w,{projectId:p.id,candidateId:c.id,expectedUpdatedAt:p.updatedAt},'editor'),/Review/);const ratings={pronunciation:4,pacing:4,naturalness:3,clarity:4,emotion:3};await reviewVoiceCandidate(w,{projectId:p.id,candidateId:c.id,ratings,notes:'Test fixture review, not real voice evidence'},'editor');await selectVoicePreset(w,{projectId:p.id,candidateId:c.id},'editor');assert.equal((await w.projects.get(p.id)).audio.asset,'');const {project:saved}=await applyVoiceCandidate(w,{projectId:p.id,candidateId:c.id,expectedUpdatedAt:p.updatedAt},'editor');assert.equal(saved.audio.asset,c.asset);assert.equal(saved.burnCaptions,false);assert.equal(saved.srt,c.srt);assert.ok((await readVoiceReview(w,p.id)).events.some(e=>e.type==='candidate-applied'));}));
test('unknown provider outcome blocks a duplicate paid call',()=>fixture(async(w,p,f,requests)=>{let paid=0;const failing=async(u,o)=>{if(String(u).includes('/v2/voices'))return f(u,o);paid++;throw Error('Interrupted');};await assert.rejects(make(w,p,failing),/Interrupted/);await assert.rejects(make(w,p,failing),/unresolved/);assert.equal(paid,1);}));
test('stale source revision and unreviewed facts fail before provider calls',()=>fixture(async(w,p,f,requests)=>{await assert.rejects(queueVoiceReview(w,{...body(p),factsReviewed:false},'editor'),/Review/);await assert.rejects(queueVoiceReview(w,{...body(p),expectedUpdatedAt:'stale'},'editor'),/changed/);assert.equal(requests.length,0);}));
test('sentence splitter retains script spacing and paragraph breaks',()=>{const s='Bruno Fernandes is captain.\n\nCarrick says he is committed.';assert.equal(sentenceSpans(s).map(x=>x.text).join(''),s);});
test('longer narration cannot silently freeze or stretch background footage; music level is preserved',()=>fixture(async(w,p,f)=>{
 p=await w.projects.save(p.id,{scenes:[{id:'s',duration:1,background:'#000000',layers:[],video:{asset:'uploads/background.mp4',start:0}}],music:{asset:'uploads/music.mp3',start:0,end:1,volume:.2}},p.updatedAt);
 const c=await make(w,p,f);await reviewVoiceCandidate(w,{projectId:p.id,candidateId:c.id,ratings:{pronunciation:3,pacing:3,naturalness:3,clarity:3,emotion:3},notes:'Fixture only'},'editor');await selectVoicePreset(w,{projectId:p.id,candidateId:c.id},'editor');
 await assert.rejects(applyVoiceCandidate(w,{projectId:p.id,candidateId:c.id,expectedUpdatedAt:p.updatedAt},'editor'),/longer background footage/);assert.deepEqual(await w.projects.get(p.id),p);
 p=await w.projects.save(p.id,{scenes:[{...p.scenes[0],duration:5}],music:{...p.music,end:5}},p.updatedAt);const saved=(await applyVoiceCandidate(w,{projectId:p.id,candidateId:c.id,expectedUpdatedAt:p.updatedAt},'editor')).project;assert.equal(saved.music.volume,.2);assert.equal(saved.music.ducking,true);assert.ok(saved.music.end<=saved.scenes[0].duration);
}));
test('invalid sentence edits are rejected before paid generation',()=>fixture(async(w,p,f,requests)=>{const c=await make(w,p,f);await assert.rejects(queueVoiceReview(w,{...body(p),parentId:c.id,sentenceIndex:0,sentenceText:'Two. Sentences.'},'editor'),/one sentence/);assert.equal(requests.length,1);}));
test('OpenAI pause metadata reaches audio assembly without being spoken, and stale cues are rejected',()=>fixture(async(w,p,f,requests)=>{
 const brief={sourceArticleId:'article',sourceFingerprint:'fingerprint',script:p.script,profile:'journalist',sentences:[{text:'Hello.',pauseAfterSeconds:.6,delivery:'neutral',direction:'Pause before the next fact.'},{text:'Next.',pauseAfterSeconds:0,delivery:'reflective',direction:'Stay measured.'}],pronunciationChecks:[],provider:'OpenAI',model:'gpt-4o-mini',promptVersion:'test',updatedAt:new Date().toISOString()};
 p=await w.projects.save(p.id,{deliveryBrief:brief},p.updatedAt);const c=await make(w,p,f,{useDeliveryBrief:true});assert.equal(requests[0].text,'Hello. Next.');assert.ok(!requests[0].text.includes('Pause'));assert.equal(c.segments[0].settings.pause,.6);assert.equal(c.segments[0].direction,'Pause before the next fact.');assert.ok(c.segments[1].timelineStart>1);await assert.rejects(queueVoiceReview(w,{...body(p),script:'Changed script.',useDeliveryBrief:true},'editor'),/Script changed/);
}));

import {trialText,cleanTrialAlignment} from './voice-review.mjs';
test('subtle trial preserves every word; captions remove directions and retain provider timing',()=>{
 const script='Carrick is committed. Bruno remains captain. United face Chelsea.';
 const directed=trialText(script,'subtle');assert.equal(directed.replace(/\[[^\]]+\] /g,''),script);assert.equal(trialText(script,'plain'),script);
 const chars=[...directed],a={characters:chars,character_start_times_seconds:chars.map((_,i)=>i*.02),character_end_times_seconds:chars.map((_,i)=>(i+1)*.02)};
 const clean=cleanTrialAlignment(script,a);assert.equal(clean.characters.join(''),script);assert.equal(clean.character_start_times_seconds[0],directed.indexOf('Carrick')*.02);
 assert.throws(()=>cleanTrialAlignment('Changed facts.',a),/differs/);assert.throws(()=>trialText('[laughing] News','subtle'),/clean/);
});
test('v3 A/B auditions share settings, preserve whole audio and project, and cannot change production',()=>fixture(async(w,p,f,requests)=>{
 const original=await w.projects.get(p.id);
 const fetcher=async(u,o)=>{if(String(u).includes('/v2/voices'))return f(u,o);const r=await f(u,o),d=await r.json();d.alignment.character_start_times_seconds=d.alignment.characters.map((_,i)=>i*.02);d.alignment.character_end_times_seconds=d.alignment.characters.map((_,i)=>(i+1)*.02);return Response.json(d);};
 const a=await make(w,p,fetcher,{trial:'plain',settings:{speed:.9}}),b=await make(w,p,fetcher,{trial:'subtle',settings:{speed:.9}});
 assert.equal(requests.length,2);assert.equal(requests[0].model_id,'eleven_v3');assert.equal(requests[1].model_id,'eleven_v3');assert.deepEqual(requests[0].voice_settings,requests[1].voice_settings);assert.equal(requests[0].seed,requests[1].seed);
 for(const c of [a,b]){assert.equal(c.script,p.script);assert.equal(c.segments.length,2);assert.ok(!c.srt.includes('['));assert.ok(parseSrt(c.srt).at(-1).end<=c.duration);assert.equal(c.settings.pause,0);await assert.rejects(selectVoicePreset(w,{projectId:p.id,candidateId:c.id},'editor'),/review-only/);await assert.rejects(applyVoiceCandidate(w,{projectId:p.id,candidateId:c.id},'editor'),/review-only/);}
 assert.deepEqual(await w.projects.get(p.id),original);
}));
test('v3 invalid alignment retains paid source and retry uses cache rather than charging again',()=>fixture(async(w,p,f,requests)=>{
 const broken=async(u,o)=>{const r=await f(u,o);if(String(u).includes('/v2/voices'))return r;const d=await r.json();d.alignment.characters[0]='X';return Response.json(d);};
 for(let i=0;i<2;i++)await assert.rejects(make(w,p,broken,{trial:'plain'}),/differs/);
 assert.equal(requests.length,1);assert.equal(Object.keys((await w.snapshot()).state.voiceGenerationRecords).length,1);assert.equal((await readVoiceReview(w,p.id)).candidates.length,0);
}));

test('v3 sentence tags produce a separate timed candidate; Apply preserves defaults and is explicit',()=>fixture(async(w,p,f,requests,root)=>{
 const fetcher=async(u,o)=>{const r=await f(u,o);if(String(u).includes('/v2/voices'))return r;const d=await r.json();d.alignment.character_start_times_seconds=d.alignment.characters.map((_,i)=>i*.02);d.alignment.character_end_times_seconds=d.alignment.characters.map((_,i)=>(i+1)*.02);return Response.json(d);};
 const original=await w.projects.get(p.id),b=await make(w,p,fetcher,{trial:'subtle',settings:{speed:.9}});
 assert.equal(b.segments.length,2);assert.deepEqual(b.segments[0].tags,['slowly']);
 const edited=await make(w,p,fetcher,{parentId:b.id,sentenceIndex:1,sentenceText:'Next.',tagEdit:true,sentenceTags:'[softly] [short pause]',settings:{speed:.9}});
 await assert.rejects(make(w,p,fetcher,{parentId:b.id,sentenceIndex:1,sentenceText:'Next.',tagEdit:true,sentenceTags:'[unsupported]'}),/supported bracketed/);
 assert.equal(requests.length,2);assert.equal(requests[1].model_id,'eleven_v3');assert.equal(requests[1].text,'[softly] [short pause] Next.');assert.equal(requests[1].previous_text,undefined);
 assert.deepEqual(edited.segments[0],b.segments[0]);assert.deepEqual(edited.segments[1].tags,['softly','short pause']);assert.equal(edited.script,p.script);assert.ok(!edited.srt.includes('['));assert.deepEqual(await w.projects.get(p.id),original);
 await assert.rejects(applyVoiceCandidate(w,{projectId:p.id,candidateId:edited.id,expectedUpdatedAt:p.updatedAt},'editor'),/Review/);
 await reviewVoiceCandidate(w,{projectId:p.id,candidateId:edited.id,ratings:{pronunciation:4,pacing:4,naturalness:4,clarity:4,emotion:4},notes:'Synthetic fixture only'},'editor');
 await assert.rejects(selectVoicePreset(w,{projectId:p.id,candidateId:edited.id},'editor'),/defaults are unchanged/);
 const saved=(await applyVoiceCandidate(w,{projectId:p.id,candidateId:edited.id,expectedUpdatedAt:p.updatedAt},'editor')).project;
 assert.equal(saved.audio.asset,edited.asset);assert.equal(saved.srt,edited.srt);assert.equal(saved.burnCaptions,original.burnCaptions);assert.deepEqual((await readVoiceReview(w,p.id)).presets,[]);
 const disk=createWorkspaceStore(diskObjectStore(root));assert.equal((await disk.projects.get(p.id)).audio.asset,edited.asset);assert.ok((await disk.getFile(b.asset)).bytes.length>0);
 assert.ok((await readVoiceReview(w,p.id)).events.some(e=>e.type==='audition-generated'&&e.tags?.includes('softly')));
}));
test('invalid tags, incompatible model and stale edits never consume generation credits',()=>fixture(async(w,p,f,requests)=>{
 const c=await make(w,p,f);
 await assert.rejects(make(w,p,f,{parentId:c.id,sentenceIndex:0,sentenceText:'Hello.',tagEdit:true,sentenceTags:'[calm]'}),/Eleven v3/);
 assert.equal(requests.length,1);
}));

import {parseExpressiveTags} from './voice-review.mjs';
test('tag parsing rejects unsupported tags and free text before generation',()=>{
 assert.deepEqual(parseExpressiveTags(''),[]);assert.deepEqual(parseExpressiveTags('[calm] [short pause]'),['calm','short pause']);
 for(const value of ['speak calmly','[not a tag]','[calm','[calm] extra','[calm] '.repeat(5)])assert.throws(()=>parseExpressiveTags(value));
});

test('v3 sentence timing failure retains the paid response, and retry never charges again',()=>fixture(async(w,p,f,requests)=>{
 const good=async(u,o)=>{const r=await f(u,o);if(String(u).includes('/v2/voices'))return r;const d=await r.json();d.alignment.character_start_times_seconds=d.alignment.characters.map((_,i)=>i*.02);d.alignment.character_end_times_seconds=d.alignment.characters.map((_,i)=>(i+1)*.02);return Response.json(d);};
 const b=await make(w,p,good,{trial:'subtle'});const bad=async(u,o)=>{const r=await good(u,o);if(String(u).includes('/v2/voices'))return r;const d=await r.json();d.alignment.characters[d.alignment.characters.indexOf('N')]='X';return Response.json(d);};
 const edit={parentId:b.id,sentenceIndex:1,sentenceText:'Next.',tagEdit:true,sentenceTags:'[softly]'};
 for(let i=0;i<2;i++)await assert.rejects(make(w,p,bad,edit),/differs/);
 assert.equal(requests.length,2);assert.deepEqual(await w.projects.get(p.id),p);
 const changed=await w.projects.save(p.id,{script:'Changed facts.'},p.updatedAt);
 await assert.rejects(make(w,changed,good,edit),/script changed/);assert.equal(requests.length,2);
}));
test('explicit Apply approves a sentence-tag candidate without inventing numerical review ratings',()=>fixture(async(w,p,f)=>{
 const fetcher=async(u,o)=>{const r=await f(u,o);if(String(u).includes('/v2/voices'))return r;const d=await r.json();d.alignment.character_start_times_seconds=d.alignment.characters.map((_,i)=>i*.02);d.alignment.character_end_times_seconds=d.alignment.characters.map((_,i)=>(i+1)*.02);return Response.json(d);};
 const b=await make(w,p,fetcher,{trial:'subtle'}),c=await make(w,p,fetcher,{parentId:b.id,sentenceIndex:1,sentenceText:'Next.',tagEdit:true,sentenceTags:'[calm]'});
 await assert.rejects(applyVoiceCandidate(w,{projectId:p.id,candidateId:c.id,expectedUpdatedAt:'stale',editorApproval:true},'editor'),/changed/);
 assert.equal((await readVoiceReview(w,p.id)).candidates.at(-1).approval,undefined);
 const saved=await applyVoiceCandidate(w,{projectId:p.id,candidateId:c.id,expectedUpdatedAt:p.updatedAt,editorApproval:true},'editor');
 assert.equal(saved.project.audio.asset,c.asset);const candidate=(await readVoiceReview(w,p.id)).candidates.at(-1);assert.equal(candidate.review,undefined);assert.equal(candidate.approval.method,'explicit-apply');assert.equal(candidate.approval.approvedBy,'editor');
}));

test('delivery-only regeneration changes expressiveness but preserves model, words, tags, speed and pauses',()=>fixture(async(w,p,f,requests)=>{
 p=await w.projects.save(p.id,{script:'Hello.\n\nNext.',scenes:[{id:'a',duration:2,background:'#000000',layers:[]},{id:'b',duration:2,background:'#000000',layers:[]}]},p.updatedAt);
 const provider=async(u,o)=>{const r=await f(u,o);if(String(u).includes('/v2/voices'))return r;const d=await r.json();d.alignment.character_start_times_seconds=d.alignment.characters.map((_,i)=>i*.02);d.alignment.character_end_times_seconds=d.alignment.characters.map((_,i)=>(i+1)*.02);return Response.json(d);};
 const b=await make(w,p,provider,{trial:'subtle',settings:{speed:.9,style:.15}});
 const c=await make(w,p,provider,{parentId:b.id,deliveryEdit:true,settings:{style:.35,speed:1.2,pause:1,stability:.1}});
 assert.equal(c.deliveryEdit,true);assert.equal(c.trial,null);assert.equal(c.settings.style,.35);assert.equal(c.settings.speed,.9);assert.equal(c.settings.pause,0);assert.equal(c.settings.stability,.5);
 assert.equal(requests[1].text,requests[0].text);assert.equal(requests[1].model_id,requests[0].model_id);assert.deepEqual(requests[1].voice_settings,{...requests[0].voice_settings,style:.35});
 assert.equal(c.script,p.script);assert.deepEqual(await w.projects.get(p.id),p);
 const upbeat=await make(w,p,provider,{parentId:c.id,deliveryEdit:true,deliveryTone:'upbeat',settings:{style:.35}});assert.match(requests[2].text,/\[excited\]/);assert.ok(!requests[2].text.includes('[slowly]'));assert.deepEqual(requests[2].voice_settings,requests[1].voice_settings);assert.equal(upbeat.script,p.script);assert.ok(!upbeat.srt.includes('['));
 await assert.rejects(applyVoiceCandidate(w,{projectId:p.id,candidateId:c.id,expectedUpdatedAt:p.updatedAt},'editor'),/Review/);
 await assert.rejects(selectVoicePreset(w,{projectId:p.id,candidateId:c.id},'editor'),/defaults are unchanged/);
 const applied=await applyVoiceCandidate(w,{projectId:p.id,candidateId:c.id,expectedUpdatedAt:p.updatedAt,editorApproval:true},'editor');assert.equal(applied.project.audio.asset,c.asset);assert.equal(applied.project.script,p.script);
}));

import {upbeatDeliveryText} from './voice-review.mjs';
test('upbeat directions replace restrained delivery while preserving words and pause cues',()=>{
 const original='[slowly] Opening.\n\nSecond story. [short pause] More news.\n\n[calm] Closing.';
 const next=upbeatDeliveryText(original);
 assert.equal(upbeatDeliveryText(next),next);
 assert.equal(next,'[excited] Opening.\n\n[excited] Second story. [short pause] More news.\n\n[excited] Closing.');
 assert.equal(next.replace(/\[[^\]]+\]\s*/g,''),original.replace(/\[[^\]]+\]\s*/g,''));
});

test('1.25x tempo uses existing audio only, retimes captions and never compounds a previous tempo',()=>fixture(async(w,p,f,requests)=>{
 const source=await make(w,p,f);const noProvider=()=>{throw Error('Tempo must not call ElevenLabs');};
 const faster=await make(w,p,noProvider,{parentId:source.id,tempoEdit:true,tempo:1.25});
 assert.equal(requests.length,1);assert.equal(faster.tempo,1.25);assert.equal(faster.script,source.script);assert.ok(Math.abs(faster.duration-source.duration/1.25)<.15);const saved=(await w.snapshot()).state.voiceCandidates;assert.equal(saved.find(c=>c.id===faster.id).alignment.character_start_times_seconds[4],saved.find(c=>c.id===source.id).alignment.character_start_times_seconds[4]/1.25);
 const reset=await make(w,p,noProvider,{parentId:faster.id,tempoEdit:true,tempo:1});assert.ok(Math.abs(reset.duration-source.duration)<.15);assert.equal(reset.tempoSourceId,source.id);
 await assert.rejects(make(w,p,noProvider,{parentId:source.id,tempoEdit:true,tempo:3}));
 const applied=await applyVoiceCandidate(w,{projectId:p.id,candidateId:faster.id,expectedUpdatedAt:p.updatedAt,editorApproval:true},'editor');assert.equal(applied.project.audio.asset,faster.asset);assert.equal(applied.project.script,p.script);
}));

import {saveNarrationBrief} from './voice-review.mjs';
test('matched brief previews preserve production, use continuous spoken input, require listening approval and persist captions',()=>fixture(async(w,p,f,requests)=>{
 const original=await w.projects.get(p.id),brief={script:p.script,direction:'Never speak this instruction.',pronunciation:'Check names.',source:'Editorial source',performance:[{text:p.script,direction:'Measured curiosity',tags:['curious']}],tempo:1.25};
 const saved=await saveNarrationBrief(w,{projectId:p.id,expectedUpdatedAt:p.updatedAt,brief},'editor');assert.deepEqual(await w.projects.get(p.id),original);
 await assert.rejects(saveNarrationBrief(w,{projectId:p.id,expectedUpdatedAt:p.updatedAt,brief},'editor'),/Brief changed/);
 const fetcher=async(u,o)=>{const r=await f(u,o);if(String(u).includes('/v2/voices'))return r;const d=await r.json();d.alignment.character_start_times_seconds=d.alignment.characters.map((_,i)=>i*.02);d.alignment.character_end_times_seconds=d.alignment.characters.map((_,i)=>(i+1)*.02);return Response.json(d);};
 const opts={script:brief.script,briefUpdatedAt:saved.updatedAt,comparisonId:'brief-pair-test',settings:{style:.15}},a=await make(w,p,fetcher,{...opts,briefVariant:'plain'}),b=await make(w,p,fetcher,{...opts,briefVariant:'directed'});
 assert.equal(requests.length,2);assert.equal(requests[0].text,p.script);assert.equal(requests[1].text,'[curious] '+p.script);assert.equal(requests[0].model_id,'eleven_v3');assert.deepEqual(requests[0].voice_settings,requests[1].voice_settings);assert.equal(requests[0].voice_settings.speed,undefined);assert.equal(a.tempo,1.25);assert.ok(b.duration<1.9);assert.deepEqual(await w.projects.get(p.id),original);assert.ok(parseSrt(b.srt).at(-1).end<=b.duration);
 await assert.rejects(queueVoiceReview(w,{...body(p),...opts,settings:{style:.8},briefVariant:'plain'},'editor'),/inputs changed/);
 await assert.rejects(applyVoiceCandidate(w,{projectId:p.id,candidateId:b.id,expectedUpdatedAt:p.updatedAt,editorApproval:true,listeningChecked:true},'editor'),/comparison/);
 await reviewVoiceCandidate(w,{projectId:p.id,candidateId:b.id,ratings:{pronunciation:4,pacing:4,naturalness:4,clarity:4,emotion:4},notes:'Synthetic fixture only; real voice not evaluated.'},'editor');
 await assert.rejects(applyVoiceCandidate(w,{projectId:p.id,candidateId:b.id,expectedUpdatedAt:p.updatedAt,listeningChecked:true},'editor'),/comparison/);
 const result=await applyVoiceCandidate(w,{projectId:p.id,candidateId:b.id,expectedUpdatedAt:p.updatedAt,editorApproval:true,listeningChecked:true},'editor');assert.equal(result.project.audio.asset,b.asset);assert.equal(result.project.srt,b.srt);assert.equal(result.project.burnCaptions,false);assert.equal((await readVoiceReview(w,p.id)).narrationBrief.updatedAt,saved.updatedAt);
}));
