import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {accountVoices,timedPlan} from './elevenlabs.mjs';
import {parseBuffer} from 'music-metadata';
import {patchWorkspaceJob} from './workspace-render.mjs';
import {run} from './engine.mjs';
import {TEAMTALK_DELIVERY,TEAMTALK_MAYA_DELIVERY,TEAMTALK_LIVE_PROFILE,TEAMTALK_PRESENTERS,parseTeamtalkTurns,resolveTeamtalkPresenterClips,speakerScript,teamtalkNarrationPlan} from './teamtalk-live.mjs';
const model='eleven_multilingual_v2';

export async function queueWorkspaceNarration(workspace,body,userId){
 return workspace.update(state=>{
  const p=state.projects.find(p=>p.id===body.projectId&&!p.trashedAt);
  if(!p||p.updatedAt!==body.expectedUpdatedAt)throw Error('Project changed. Reload before generating.');
  if(p.deliveryBrief)throw Error('Use Voice review to preserve the imported OpenAI delivery cues and review the script before audio generation.');
  if(typeof body.voiceId!=='string'||!body.voiceId)throw Error('Select an account voice');
  const teamtalk=p.productionProfile===TEAMTALK_LIVE_PROFILE;
  if(teamtalk){
   if(!p.script?.trim()||p.script.trim().length>10000)throw Error('Use a script of up to 10,000 characters');
   parseTeamtalkTurns(p.script);
  }else if(!p.script?.trim()||p.script.trim().length>10000||p.script.trim().split(/\n\s*\n/).length!==p.scenes.length)throw Error('Use one script paragraph per scene, up to 10,000 characters');
  if(!teamtalk&&(p.scenes.some(s=>s.video?.asset)||p.music?.asset))throw Error('Automatic narration timing currently supports image scenes without music. Use a separate draft.');
  if(state.jobs.some(j=>['queued','running','saving'].includes(j.status)))throw Error('Another Studio build or narration is running');
  const now=new Date().toISOString(),job={id:randomUUID(),createdBy:userId,createdAt:now,updatedAt:now,status:'queued',stage:'Narration queued',progress:0,request:{kind:'narration',projectId:p.id,project:structuredClone(p),voiceId:body.voiceId}};
  state.jobs.push(job);return job;
 });
}

async function storedNarration(workspace,{projectId,title,script,voice,key,fetcher,jobId,voiceSettings}){
 const identity={projectId,script,voiceId:voice.id,model};
 if(voiceSettings) identity.voiceSettings=voiceSettings;
 const hash=createHash('sha256').update(JSON.stringify(identity)).digest('hex');
 let record=(await workspace.snapshot()).state.narrationRecords?.[hash];
 if(!record){
  await workspace.update(s=>{s.narrationRequests??={};if(s.narrationRequests[hash])throw Error('A previous request has an unresolved outcome. Check ElevenLabs history before retrying to avoid duplicate charges.');s.narrationRequests[hash]={jobId,requestedAt:new Date().toISOString()};return true;});
  const payload={text:script,model_id:model};if(voiceSettings)payload.voice_settings=voiceSettings;
  const response=await fetcher('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voice.id)+'/with-timestamps',{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
  if(!response.ok){if(response.status>=400&&response.status<500)await workspace.update(s=>{delete s.narrationRequests[hash];return true;});throw Error('ElevenLabs generation failed (HTTP '+response.status+'). No automatic paid retry was made.');}
  const data=await response.json();if(typeof data.audio_base64!=='string'||data.audio_base64.length>40e6)throw Error('Invalid provider audio response. Check generation history before retrying.');
  const bytes=Buffer.from(data.audio_base64,'base64'),metadata=await parseBuffer(bytes,{mimeType:'audio/mpeg'},{duration:true}),duration=metadata.format.duration;
  if(!Number.isFinite(duration)||duration<=0)throw Error('Generated audio is unreadable. Check generation history.');
  const generatedAt=new Date().toISOString(),entry=await workspace.putBytes('narration/'+hash+'.mp3',bytes,{name:voice.name+' · '+title,updatedAt:generatedAt});
  record={asset:entry.asset,voiceId:voice.id,voiceName:voice.name,model,script,alignment:data.alignment||data.normalized_alignment,duration,generatedAt};
  await workspace.update(s=>{s.assets[entry.asset]=entry;s.narrationRecords??={};s.narrationRecords[hash]=record;delete s.narrationRequests[hash];return true;});
 }
 return record;
}

async function mixSpeech(workspace,daniel,maya,plan){
 const hash=createHash('sha256').update(JSON.stringify({mix:'teamtalk-live',daniel:daniel.asset,maya:maya.asset,placements:plan.placements})).digest('hex');
 const existing=(await workspace.snapshot()).state.narrationRecords?.[hash];
 if(existing?.asset)return existing;
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'teamtalk-mix-'));
 try{
  const danielFile=path.join(root,'daniel.mp3'),mayaFile=path.join(root,'maya.mp3'),mixed=path.join(root,'mix.mp3');
  await fs.writeFile(danielFile,(await workspace.getFile(daniel.asset)).bytes);
  await fs.writeFile(mayaFile,(await workspace.getFile(maya.asset)).bytes);
  const filters=[`[2:a]atrim=duration=${plan.duration},asetpts=PTS-STARTPTS[silence]`];
  const copies=(count,input,prefix)=>count<=1?[`${input}:a`]:(filters.push(`[${input}:a]asplit=${count}${Array.from({length:count},(_,i)=>`[${prefix}${i}]`).join('')}`),Array.from({length:count},(_,i)=>`${prefix}${i}`));
  const danielSources=copies(plan.placements.filter(item=>item.speaker==='daniel').length,0,'d');
  const mayaSources=copies(plan.placements.filter(item=>item.speaker==='maya').length,1,'m');
  const used={daniel:0,maya:0};
  plan.placements.forEach((placement,index)=>{
   const limit=placement.speaker==='daniel'?daniel.duration:maya.duration;
   const end=Math.min(placement.end,limit);
   if(!(end>placement.start))throw Error('Generated audio is shorter than the timed line. Audio retained; review alignment before retrying.');
   const source=(placement.speaker==='daniel'?danielSources:mayaSources)[used[placement.speaker]++];
   filters.push(`[${source}]atrim=start=${placement.start}:end=${end},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(placement.timeline*48000)}S:all=1[t${index}]`);
  });
  filters.push(`[silence]${plan.placements.map((_,index)=>`[t${index}]`).join('')}amix=inputs=${plan.placements.length+1}:duration=first:normalize=0:dropout_transition=0[a]`);
  await run(['-y','-i',danielFile,'-i',mayaFile,'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-filter_complex',filters.join(';'),'-map','[a]','-t',String(plan.duration),'-c:a','libmp3lame',mixed]);
  const bytes=await fs.readFile(mixed);
  const generatedAt=new Date().toISOString();
  const entry=await workspace.putBytes('narration/'+hash+'.mp3',bytes,{name:'TEAMtalk LIVE dual presenter mix',updatedAt:generatedAt});
  const record={asset:entry.asset,voiceId:'',voiceName:`${daniel.voiceName} and ${maya.voiceName}`,model,script:'',duration:plan.duration,generatedAt,danielAsset:daniel.asset,mayaAsset:maya.asset};
  await workspace.update(s=>{s.assets[entry.asset]=entry;s.narrationRecords??={};s.narrationRecords[hash]=record;return true;});
  return record;
 }finally{await fs.rm(root,{recursive:true,force:true});}
}

async function runTeamtalkNarration(workspace,job,key,fetcher){
 const p=job.request.project;
 const voices=await accountVoices(key,fetcher);
 const presenterVoice=person=>voices.find(voice=>voice.id===person.elevenlabsVoiceId);
 const danielVoice=presenterVoice(TEAMTALK_PRESENTERS[0]),mayaVoice=presenterVoice(TEAMTALK_PRESENTERS[1]);
 if(!danielVoice||!mayaVoice)throw Error('Planet F1 - Male - Sam or Amelia - Enthusiastic and Expressive is unavailable to the connected account. No narration generated.');
 const {clips,missing}=resolveTeamtalkPresenterClips(Object.values((await workspace.snapshot()).state.assets||{}));
 if(missing.length)throw Error('Presenter Presenting and Listening clips are missing. No narration generated.');
 const turns=parseTeamtalkTurns(p.script);
 const danielText=speakerScript(turns,'daniel'),mayaText=speakerScript(turns,'maya');
 await patchWorkspaceJob(workspace,job.id,{stage:'Generating Planet F1 - Male - Sam',progress:20});
 const daniel=await storedNarration(workspace,{projectId:p.id,title:p.title,script:danielText,voice:danielVoice,key,fetcher,jobId:job.id,voiceSettings:TEAMTALK_DELIVERY});
 if((await workspace.snapshot()).state.jobs.find(item=>item.id===job.id)?.cancelRequestedAt)throw Error('Narration cancelled. Any generated audio is retained in the Library.');
 await patchWorkspaceJob(workspace,job.id,{stage:'Generating Amelia - Enthusiastic and Expressive',progress:55});
 const maya=await storedNarration(workspace,{projectId:p.id,title:p.title,script:mayaText,voice:mayaVoice,key,fetcher,jobId:job.id,voiceSettings:TEAMTALK_MAYA_DELIVERY});
 const plan=teamtalkNarrationPlan({script:p.script,danielAlignment:daniel.alignment,mayaAlignment:maya.alignment,scenes:p.scenes,fps:p.fps,clips,danielDuration:daniel.duration,mayaDuration:maya.duration});
 await patchWorkspaceJob(workspace,job.id,{stage:'Mixing both presenter voices',progress:80});
 const mixed=await mixSpeech(workspace,daniel,maya,plan);
 const saved=await workspace.projects.save(p.id,{script:p.script.trim(),voice:`${daniel.voiceName} and ${maya.voiceName}`,elevenlabsVoiceId:'',audioLabel:`${daniel.voiceName} and ${maya.voiceName} · ElevenLabs · ${mixed.generatedAt}`,audio:{asset:mixed.asset,volume:1},srt:plan.srt,scenes:plan.scenes},p.updatedAt);
 await patchWorkspaceJob(workspace,job.id,{status:'complete',stage:'Both presenter voices saved',progress:100,result:{project:saved,narration:{voiceName:`${daniel.voiceName} and ${maya.voiceName}`,voices:[{voiceId:daniel.voiceId,voiceName:daniel.voiceName},{voiceId:maya.voiceId,voiceName:maya.voiceName}],duration:plan.duration,generatedAt:mixed.generatedAt},rebuildRequired:true}});
}

export async function runWorkspaceNarration(workspace,id,key,fetcher=fetch){
 const job=await workspace.update(s=>{const j=s.jobs.find(j=>j.id===id);if(!j||j.status!=='queued')throw Error('Narration already claimed');j.status='running';j.startedAt=new Date().toISOString();j.stage='Checking account voice';j.updatedAt=new Date().toISOString();return structuredClone(j);});
 try{
  const p=job.request.project;
  if(p.productionProfile===TEAMTALK_LIVE_PROFILE){await runTeamtalkNarration(workspace,job,key,fetcher);return;}
  const voiceId=job.request.voiceId,script=p.script.trim();
  const voices=await accountVoices(key,fetcher),voice=voices.find(v=>v.id===voiceId);if(!voice)throw Error('Selected voice is unavailable to the connected account. No narration generated.');
  const record=await storedNarration(workspace,{projectId:p.id,title:p.title,script,voice,key,fetcher,jobId:id});
  if((await workspace.snapshot()).state.jobs.find(j=>j.id===id)?.cancelRequestedAt)throw Error('Narration cancelled. Any generated audio is retained in the Library.');
  const plan=timedPlan(script,record.alignment,record.duration,p.scenes,p.fps);
  const saved=await workspace.projects.save(p.id,{script,voice:voice.name,elevenlabsVoiceId:voiceId,audioLabel:voice.name+' · ElevenLabs · '+record.generatedAt,audio:{asset:record.asset,volume:1},srt:plan.srt,scenes:plan.scenes},p.updatedAt);
  await patchWorkspaceJob(workspace,id,{status:'complete',stage:'Narration saved and captions synchronised',progress:100,result:{project:saved,narration:{voiceId,voiceName:voice.name,duration:record.duration,generatedAt:record.generatedAt},rebuildRequired:true}});
 }catch(e){await patchWorkspaceJob(workspace,id,{status:'failed',stage:e.message});throw e;}
}
