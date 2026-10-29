import {createHash,randomUUID} from 'node:crypto';import {accountVoices,timedPlan} from './elevenlabs.mjs';import {parseBuffer} from 'music-metadata';import {patchWorkspaceJob} from './workspace-render.mjs';
const model='eleven_multilingual_v2';
export async function queueWorkspaceNarration(workspace,body,userId){
 return workspace.update(state=>{const p=state.projects.find(p=>p.id===body.projectId&&!p.trashedAt);if(!p||p.updatedAt!==body.expectedUpdatedAt)throw Error('Project changed. Reload before generating.');if(p.deliveryBrief)throw Error('Use Voice review to preserve the imported OpenAI delivery cues and review the script before audio generation.');if(typeof body.voiceId!=='string'||!body.voiceId)throw Error('Select an account voice');if(!p.script?.trim()||p.script.trim().length>10000||p.script.trim().split(/\n\s*\n/).length!==p.scenes.length)throw Error('Use one script paragraph per scene, up to 10,000 characters');if(p.scenes.some(s=>s.video?.asset)||p.music?.asset)throw Error('Automatic narration timing currently supports image scenes without music. Use a separate draft.');if(state.jobs.some(j=>['queued','running','saving'].includes(j.status)))throw Error('Another Studio build or narration is running');const now=new Date().toISOString(),job={id:randomUUID(),createdBy:userId,createdAt:now,updatedAt:now,status:'queued',stage:'Narration queued',progress:0,request:{kind:'narration',projectId:p.id,project:structuredClone(p),voiceId:body.voiceId}};state.jobs.push(job);return job;});
}
export async function runWorkspaceNarration(workspace,id,key,fetcher=fetch){
 const job=await workspace.update(s=>{const j=s.jobs.find(j=>j.id===id);if(!j||j.status!=='queued')throw Error('Narration already claimed');j.status='running';j.startedAt=new Date().toISOString();j.stage='Checking account voice';j.updatedAt=new Date().toISOString();return structuredClone(j);});
 try{
  const p=job.request.project,voiceId=job.request.voiceId,script=p.script.trim();
  const voices=await accountVoices(key,fetcher),voice=voices.find(v=>v.id===voiceId);if(!voice)throw Error('Selected voice is unavailable to the connected account. No narration generated.');
  const hash=createHash('sha256').update(JSON.stringify({projectId:p.id,script,voiceId,model})).digest('hex');
  let record=(await workspace.snapshot()).state.narrationRecords?.[hash];
  if(!record){
   await workspace.update(s=>{s.narrationRequests??={};if(s.narrationRequests[hash])throw Error('A previous request has an unresolved outcome. Check ElevenLabs history before retrying to avoid duplicate charges.');s.narrationRequests[hash]={jobId:id,requestedAt:new Date().toISOString()};return true;});
   await patchWorkspaceJob(workspace,id,{stage:'Generating selected account voice',progress:20});
   const response=await fetcher('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voiceId)+'/with-timestamps',{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({text:script,model_id:model}),signal:AbortSignal.timeout(120000)});
   if(!response.ok){if(response.status>=400&&response.status<500)await workspace.update(s=>{delete s.narrationRequests[hash];return true;});throw Error('ElevenLabs generation failed (HTTP '+response.status+'). No automatic paid retry was made.');}
   const data=await response.json();if(typeof data.audio_base64!=='string'||data.audio_base64.length>40e6)throw Error('Invalid provider audio response. Check generation history before retrying.');
   const bytes=Buffer.from(data.audio_base64,'base64'),metadata=await parseBuffer(bytes,{mimeType:'audio/mpeg'},{duration:true}),duration=metadata.format.duration;
   if(!Number.isFinite(duration)||duration<=0)throw Error('Generated audio is unreadable. Check generation history.');
   const generatedAt=new Date().toISOString(),entry=await workspace.putBytes('narration/'+hash+'.mp3',bytes,{name:voice.name+' · '+p.title,updatedAt:generatedAt});
   record={asset:entry.asset,voiceId,voiceName:voice.name,model,script,alignment:data.alignment||data.normalized_alignment,duration,generatedAt};
   await workspace.update(s=>{s.assets[entry.asset]=entry;s.narrationRecords??={};s.narrationRecords[hash]=record;delete s.narrationRequests[hash];return true;});
  }
  if((await workspace.snapshot()).state.jobs.find(j=>j.id===id)?.cancelRequestedAt)throw Error('Narration cancelled. Any generated audio is retained in the Library.');
  const plan=timedPlan(script,record.alignment,record.duration,p.scenes,p.fps);
  const saved=await workspace.projects.save(p.id,{script,voice:voice.name,elevenlabsVoiceId:voiceId,audioLabel:voice.name+' · ElevenLabs · '+record.generatedAt,audio:{asset:record.asset,volume:1},srt:plan.srt,scenes:plan.scenes},p.updatedAt);
  await patchWorkspaceJob(workspace,id,{status:'complete',stage:'Narration saved and captions synchronised',progress:100,result:{project:saved,narration:{voiceId,voiceName:voice.name,duration:record.duration,generatedAt:record.generatedAt},rebuildRequired:true}});
 }catch(e){await patchWorkspaceJob(workspace,id,{status:'failed',stage:e.message});throw e;}
}
