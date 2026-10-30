/** Voice auditions are immutable candidates. Generation never changes a production project. */
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {z} from 'zod';
import {parseBuffer} from 'music-metadata';
import {accountVoices,timedPlan} from './elevenlabs.mjs';
import {run} from './engine.mjs';
import {createProjectStore} from './projects.mjs';
import {patchWorkspaceJob} from './workspace-render.mjs';
export const deliveryProfiles={
 journalist:{label:'Natural British football journalist',speed:1,stability:.5,style:.15},
 presenter:{label:'Energetic sports presenter',speed:1.06,stability:.38,style:.35},
 analyst:{label:'Calm football analyst',speed:.94,stability:.7,style:.05},
};
export const voiceReviewSettings=z.object({
 speed:z.number().min(.7).max(1.2).default(1),stability:z.number().min(0).max(1).default(.5),style:z.number().min(0).max(1).default(.15),
 pause:z.number().min(0).max(2).default(0),
 dictionaries:z.array(z.object({pronunciation_dictionary_id:z.string().min(1).max(200),version_id:z.string().min(1).max(200)}).strict()).max(3).default([]),
}).strict();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const timestamp=()=>new Date().toISOString();
function event(s,type,userId,details){s.voiceEditorialEvents??=[];s.voiceEditorialEvents.push({id:randomUUID(),type,userId,updatedAt:timestamp(),...details});}
function projectOf(s,id){const p=s.projects.find(p=>p.id===id&&!p.trashedAt);if(!p)throw Error('Project unavailable');return p;}
function candidateOf(s,id,projectId){const c=s.voiceCandidates?.find(c=>c.id===id&&c.projectId===projectId);if(!c)throw Error('Narration candidate unavailable');return c;}
export function sentenceSpans(script){return [...new Intl.Segmenter('en-GB',{granularity:'sentence'}).segment(script)].map(x=>({text:x.segment,start:x.index,end:x.index+x.segment.length}));}
export async function readVoiceReview(w,projectId){const {state:s}=await w.snapshot();projectOf(s,projectId);return {candidates:(s.voiceCandidates||[]).filter(c=>c.projectId===projectId).map(({alignment,...c})=>c),presets:s.voiceBrandPresets||[],events:(s.voiceEditorialEvents||[]).filter(e=>e.projectId===projectId)};}
export function trialText(script,mode){
 if(!['plain','subtle'].includes(mode))throw Error('Unknown tag trial');
 if(/[\[\]<>]/.test(script))throw Error('Use clean spoken text for the comparison');
 if(script.length>4500)throw Error('Use at most 4,500 characters for the v3 trial');
 if(mode==='plain')return script;
 const spans=sentenceSpans(script);
 return spans.map((s,i)=>(i===0?'[slowly] ':i===Math.floor(spans.length/2)?'[short pause] ':i===spans.length-1?'[calm] ':'')+s.text).join('');
}
export function cleanTrialAlignment(script,alignment){
 if(!alignment||!Array.isArray(alignment.characters))throw Error('Missing trial timing; generated audio retained');
 const raw=alignment.characters,keep=[];let inTag=false,tag='';
 for(let i=0;i<raw.length;i++){if(raw[i]==='['){if(inTag)throw Error('Invalid provider tag timing');inTag=true;tag='';continue;}if(inTag){if(raw[i]===']'){if(!['slowly','short pause','calm'].includes(tag))throw Error('Unexpected provider tag; audio retained for review');inTag=false;}else tag+=raw[i];continue;}keep.push(i);}
 if(inTag)throw Error('Incomplete provider tag timing');
 const out={characters:[],character_start_times_seconds:[],character_end_times_seconds:[]};let at=0;
 for(const c of script){while(at<keep.length&&raw[keep[at]]!==c&&/\s/.test(raw[keep[at]]))at++;const i=keep[at++];if(i===undefined||raw[i]!==c)throw Error('Trial transcript differs from the clean script. Audio retained; timing needs review');out.characters.push(c);out.character_start_times_seconds.push(alignment.character_start_times_seconds[i]);out.character_end_times_seconds.push(alignment.character_end_times_seconds[i]);}
 if(keep.slice(at).some(i=>!/\s/.test(raw[i])))throw Error('Unexpected spoken text in trial timing');
 return out;
}
export async function queueVoiceReview(w,body,userId){
 return w.update(s=>{
  const p=projectOf(s,body.projectId);if(p.updatedAt!==body.expectedUpdatedAt)throw Error('Project changed. Reload before auditioning.');
  if(s.jobs.some(j=>['queued','running','saving'].includes(j.status)))throw Error('Another Studio job is running');
  if(typeof body.voiceId!=='string'||!body.voiceId||body.voiceId.length>200)throw Error('Select an account voice');
  if(body.factsReviewed!==true)throw Error('Review the script against the source before generation');
  const script=(body.script??p.script)?.trim();if(typeof script!=='string'||!script.trim()||script.length>10000)throw Error('Use a script of 1–10,000 characters');
  if(sentenceSpans(script).length>100)throw Error('Use at most 100 sentences per audition');
  if(body.trial){trialText(script,body.trial);if(body.parentId)throw Error('Trial sentence regeneration is not available');}
  const settings=voiceReviewSettings.parse(body.settings||{});if(body.trial){if(settings.dictionaries.length)throw Error('Pronunciation dictionaries are not enabled for this v3 trial');settings.stability=.5;settings.pause=0;}const profile=body.profile||'journalist';if(!Object.hasOwn(deliveryProfiles,profile))throw Error('Unknown delivery profile');
  let brief=null;if(body.useDeliveryBrief&&!body.parentId&&!body.trial){brief=p.deliveryBrief;if(!brief||brief.script!==script)throw Error('Script changed since the OpenAI delivery brief. Review cues or turn off imported directions before generating');}
  let parent;
  if(body.parentId){parent=candidateOf(s,body.parentId,p.id);if(parent.trial)throw Error('Trial sentence regeneration is not available');if(!Number.isInteger(body.sentenceIndex)||!parent.segments[body.sentenceIndex])throw Error('Select a sentence');if(body.voiceId!==parent.voiceId)throw Error('Keep the same voice when regenerating a sentence');if(typeof body.sentenceText!=='string'||!body.sentenceText.trim()||body.sentenceText.length>2000)throw Error('Enter the reviewed sentence');if(sentenceSpans(body.sentenceText.trim()).length!==1)throw Error('Regenerate one sentence at a time');}
  const now=timestamp(),j={id:randomUUID(),createdBy:userId,createdAt:now,updatedAt:now,status:'queued',stage:'Voice audition queued',progress:0,request:{kind:'voice-review',projectId:p.id,projectRevision:p.updatedAt,title:p.title,script,sourceScript:p.script,voiceId:body.voiceId,settings,profile,trial:body.trial||null,deliveryBrief:brief,...(parent?{parentId:parent.id,sentenceIndex:body.sentenceIndex,sentenceText:body.sentenceText}:{} )}};
  s.jobs.push(j);event(s,'audition-requested',userId,{projectId:p.id,jobId:j.id,profile,settings,factsReviewed:true,sourceScript:p.script,reviewedScript:script});return j;
 });
}
async function generate(w,request,key,fetcher,jobId){
 const hash=digest(request);let record=(await w.snapshot()).state.voiceGenerationRecords?.[hash];if(record)return record;
 await w.update(s=>{s.narrationRequests??={};if(s.narrationRequests[hash])throw Error('Previous generation outcome is unresolved. Check provider history before retrying; no automatic paid retry.');s.narrationRequests[hash]={jobId,requestedAt:timestamp()};return true;});
 const r=await fetcher('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(request.voiceId)+'/with-timestamps',{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify(request.payload),signal:AbortSignal.timeout(120000)});
 if(!r.ok){if(r.status>=400&&r.status<500)await w.update(s=>{delete s.narrationRequests[hash];return true;});throw Error('ElevenLabs generation failed (HTTP '+r.status+'). No automatic paid retry.');}
 const d=await r.json();if(typeof d.audio_base64!=='string'||d.audio_base64.length>40e6)throw Error('Invalid provider audio. Review provider history before retrying.');
 const bytes=Buffer.from(d.audio_base64,'base64'),duration=(await parseBuffer(bytes,{mimeType:'audio/mpeg'},{duration:true})).format.duration;
 if(!Number.isFinite(duration)||duration<=0)throw Error('Unreadable generated audio');
 const alignment=d.alignment||d.normalized_alignment;
 const generatedAt=timestamp(),entry=await w.putBytes('narration/audition-source-'+hash+'.mp3',bytes,{name:'Voice audition source',updatedAt:generatedAt});
 record={asset:entry.asset,duration,alignment,generatedAt};
 await w.update(s=>{s.assets[entry.asset]=entry;s.voiceGenerationRecords??={};s.voiceGenerationRecords[hash]=record;delete s.narrationRequests[hash];return true;});
 // Validate only after persisting the paid response; mismatches must never cause another charge.
 if(!request.trial)timedPlan(request.payload.text,alignment,duration,request.payload.text.trim().split(/\n\s*\n/).map(()=>({duration:1})),30);
 return record;
}
function partsFrom(record,script,settings,profile){
 timedPlan(script,record.alignment,record.duration,script.trim().split(/\n\s*\n/).map(()=>({duration:1})),30);
 const spans=sentenceSpans(script),a=record.alignment;
 return spans.map((s,i)=>{const start=i? a.character_start_times_seconds[s.start]:0,end=i+1<spans.length?a.character_start_times_seconds[spans[i+1].start]:record.duration;return {text:s.text,asset:record.asset,start,end,settings,profile,alignment:{characters:a.characters.slice(s.start,s.end),character_start_times_seconds:a.character_start_times_seconds.slice(s.start,s.end).map(t=>t-start),character_end_times_seconds:a.character_end_times_seconds.slice(s.start,s.end).map(t=>Math.max(0,Math.min(end,t)-start))}};});
}
export async function assembleCandidate(w,segments,id){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'voice-review-'));
 try{
  const inputs=[],filters=[],files=new Map(),alignment={characters:[],character_start_times_seconds:[],character_end_times_seconds:[]};let offset=0;
  for(const [i,s] of segments.entries()){
   let file=files.get(s.asset);if(!file){file=path.join(root,'source-'+files.size+'.mp3');await fs.writeFile(file,(await w.getFile(s.asset)).bytes);files.set(s.asset,file);}
   inputs.push('-i',file);const pause=i<segments.length-1?s.settings.pause:0,duration=s.end-s.start;
   filters.push(`[${i}:a]atrim=start=${s.start}:end=${s.end},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad=pad_dur=${pause},atrim=duration=${duration+pause}[s${i}]`);
   s.timelineStart=offset;alignment.characters.push(...s.alignment.characters);alignment.character_start_times_seconds.push(...s.alignment.character_start_times_seconds.map(t=>t+offset));alignment.character_end_times_seconds.push(...s.alignment.character_end_times_seconds.map(t=>t+offset));offset+=duration+pause;
  }
  filters.push(segments.map((_,i)=>`[s${i}]`).join('')+`concat=n=${segments.length}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11[a]`);
  const output=path.join(root,'candidate.mp3');await run(['-y','-filter_complex_threads','1',...inputs,'-filter_complex',filters.join(';'),'-map','[a]','-ar','48000','-c:a','libmp3lame','-b:a','192k',output]);
  const bytes=await fs.readFile(output),duration=(await parseBuffer(bytes,{mimeType:'audio/mpeg'},{duration:true})).format.duration;
  const script=segments.map(s=>s.text).join(''),plan=timedPlan(script,alignment,duration,script.trim().split(/\n\s*\n/).map(()=>({duration:1})),30);
  const updatedAt=timestamp(),entry=await w.putBytes('narration/audition-'+id+'.mp3',bytes,{name:'Voice review · '+id,updatedAt});
  await w.update(s=>{s.assets[entry.asset]=entry;return true;});return {asset:entry.asset,duration,alignment,script,srt:plan.srt,segments,updatedAt};
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
export async function runVoiceReview(w,id,key,fetcher=fetch){
 const job=await w.update(s=>{const j=s.jobs.find(j=>j.id===id);if(!j||j.status!=='queued')throw Error('Voice job already claimed');j.status='running';j.startedAt=timestamp();j.updatedAt=timestamp();return j;});
 try{
  const q=job.request,voice=(await accountVoices(key,fetcher)).find(v=>v.id===q.voiceId);if(!voice)throw Error('Voice unavailable to connected account');
  const state=(await w.snapshot()).state,parent=q.parentId?candidateOf(state,q.parentId,q.projectId):null;
  const text=parent?q.sentenceText+(parent.segments[q.sentenceIndex].text.match(/\s+$/)?.[0]||' '):q.script;
  const settings=q.settings,payload={text,model_id:'eleven_multilingual_v2',voice_settings:{speed:settings.speed,stability:settings.stability,style:settings.style,similarity_boost:.75,use_speaker_boost:false},pronunciation_dictionary_locators:settings.dictionaries};
  if(q.trial){payload.model_id='eleven_v3';payload.text=trialText(text,q.trial);payload.seed=365;payload.voice_settings={speed:settings.speed,stability:.5,style:settings.style,similarity_boost:.75,use_speaker_boost:false};delete payload.pronunciation_dictionary_locators;}
  if(parent){payload.previous_text=parent.segments.slice(0,q.sentenceIndex).map(s=>s.text).join('');payload.next_text=parent.segments.slice(q.sentenceIndex+1).map(s=>s.text).join('');}
  await patchWorkspaceJob(w,id,{stage:'Generating audition; production voice unchanged',progress:20});
  const record=await generate(w,{voiceId:q.voiceId,payload,...(q.trial?{trial:q.trial}:{})},key,fetcher,id);
  let segments;if(q.trial){const alignment=cleanTrialAlignment(text,record.alignment);timedPlan(text,alignment,record.duration,[{duration:1}],30);segments=[{text,asset:record.asset,start:0,end:record.duration,settings:{...settings,pause:0},profile:q.profile,alignment}];}else if(parent){segments=structuredClone(parent.segments);const replacement=partsFrom(record,text,settings,q.profile);if(replacement.length!==1)throw Error('Use one sentence for sentence regeneration. Audio retained.');segments[q.sentenceIndex]=replacement[0];}else{segments=partsFrom(record,text,settings,q.profile);if(q.deliveryBrief){if(segments.length!==q.deliveryBrief.sentences.length)throw Error('Delivery cues no longer match sentence boundaries. Audio retained.');segments=segments.map((s,i)=>{const cue=q.deliveryBrief.sentences[i];if(s.text.trim()!==cue.text.trim())throw Error('Delivery cue text does not match audio.');return {...s,settings:{...s.settings,pause:cue.pauseAfterSeconds},direction:cue.direction,suggestedDelivery:cue.delivery};});}}
  if((await w.snapshot()).state.jobs.find(j=>j.id===id)?.cancelRequestedAt)throw Error('Audition cancelled; generated source retained');
  await patchWorkspaceJob(w,id,{stage:'Preparing audio preview and caption timing',progress:70});
  const candidateId=randomUUID(),audio=await assembleCandidate(w,segments,candidateId),candidate={id:candidateId,projectId:q.projectId,projectRevision:q.projectRevision,sourceScript:q.sourceScript,profile:parent?.profile||q.profile,settings:parent?.settings||settings,voiceId:q.voiceId,voiceName:voice.name,model:payload.model_id,trial:q.trial||null,directedText:q.trial?payload.text:null,...audio,parentId:q.parentId||null,createdAt:timestamp(),status:'awaiting-editor'};
  await w.update(s=>{s.voiceCandidates??=[];s.voiceCandidates.push(candidate);event(s,'audition-generated',job.createdBy,{projectId:q.projectId,candidateId,profile:q.profile,parentId:q.parentId||null,sentenceIndex:q.sentenceIndex??null});return true;});
  await patchWorkspaceJob(w,id,{status:'complete',progress:100,stage:'Audition ready for editorial review; production voice unchanged',result:{candidateId,projectId:q.projectId}});
 }catch(e){await patchWorkspaceJob(w,id,{status:'failed',stage:e.message});throw e;}
}
export async function reviewVoiceCandidate(w,body,userId){
 if(typeof body.notes!=='string'||!body.notes.trim()||body.notes.length>4000)throw Error('Add editorial comparison notes');
 const ratings=z.object(Object.fromEntries(['pronunciation','pacing','naturalness','clarity','emotion'].map(k=>[k,z.number().int().min(1).max(5)]))).strict().parse(body.ratings);
 return w.update(s=>{projectOf(s,body.projectId);const c=candidateOf(s,body.candidateId,body.projectId);c.review={notes:body.notes,ratings,reviewedBy:userId,updatedAt:timestamp()};event(s,'audition-reviewed',userId,{projectId:c.projectId,candidateId:c.id,...c.review});return c.review;});
}
export async function selectVoicePreset(w,body,userId){
 return w.update(s=>{projectOf(s,body.projectId);const c=candidateOf(s,body.candidateId,body.projectId);if(c.trial)throw Error('This v3 trial is review-only; production remains unchanged');if(!c.review)throw Error('Compare pronunciation, pacing, naturalness, clarity and emotion before selecting');
  const preset={id:'football365',name:'Football365 · '+deliveryProfiles[c.profile].label,voiceId:c.voiceId,voiceName:c.voiceName,settings:c.settings,candidateId:c.id,selectedBy:userId,updatedAt:timestamp()};s.voiceBrandPresets=(s.voiceBrandPresets||[]).filter(p=>p.id!=='football365');s.voiceBrandPresets.push(preset);event(s,'brand-preset-selected',userId,{projectId:c.projectId,candidateId:c.id,preset});return preset;
 });
}
export async function applyVoiceCandidate(w,body,userId){
 return w.update(async state=>{const p=projectOf(state,body.projectId),c=candidateOf(state,body.candidateId,p.id);
 if(c.trial)throw Error('This v3 trial is review-only; production remains unchanged');
 if(!c.review||!state.voiceBrandPresets?.some(x=>x.candidateId===c.id))throw Error('Review and select this candidate before applying');
 if(p.updatedAt!==body.expectedUpdatedAt)throw Error('Project changed. Reload before applying');
 const plan=timedPlan(c.script,c.alignment,c.duration,p.scenes,p.fps);
 if(p.scenes.some((s,i)=>s.video?.asset&&plan.scenes[i].duration>s.duration+.001))throw Error('This narration needs longer background footage. Extend scene coverage before applying; no frozen frames are added.');
 let music=p.music;if(music?.asset){const available=Math.min(music.end-music.start,plan.duration-(music.timelineStart||0));if(available<=0)throw Error('Music starts after the new ending. Adjust its timing first.');music={...music,end:music.start+available,fadeIn:Math.min(music.fadeIn||0,available/2),fadeOut:Math.min(music.fadeOut||0,available/2),ducking:true};}
 const projectStore=createProjectStore('/unused',{persistence:{read:async()=>state,update:async fn=>fn(state)}});
 const saved=await projectStore.save(p.id,{script:c.script,voice:c.voiceName,elevenlabsVoiceId:c.voiceId,audioLabel:'Editor selected · '+c.createdAt,audio:{asset:c.asset,volume:1},srt:c.srt,scenes:plan.scenes,music},p.updatedAt);
 event(state,'candidate-applied',userId,{projectId:p.id,candidateId:c.id,previousAudio:p.audio,previousScript:p.script,previousSrt:p.srt,projectUpdatedAt:saved.updatedAt});return {project:saved,rebuildRequired:true};});
}
