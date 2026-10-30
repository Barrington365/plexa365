import {validateBroadcastReady,expandBroadcastMedia} from './broadcast.mjs';
import {isFootball365Production} from './football365-profile.mjs';
import {FOOTBALL365_PROFILE} from './football365-profile.mjs';
import {validateFootball365,prepareFootball365,finishFootball365} from './football365-production.mjs';
import {assemble,validate,probe} from './engine.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {randomUUID} from 'node:crypto';
import {validateProjectForBuild} from './projects.mjs';import {renderScenes} from './scene-renderer.mjs';import {assertAssetKey} from './workspace-store.mjs';
export function workspaceClips(state){return [...(state.sourceClips||[]),...state.jobs.filter(j=>j.status==='complete'&&j.output).map(j=>({id:'built-'+j.id,name:j.output.title,...j.output}))];}
export async function queueWorkspaceRender(workspace,input,userId){
 const {projectId,updateJobId}=input;
 if(input.clips){return workspace.update(state=>{validate(input,workspaceClips(state));if(state.jobs.some(j=>['queued','running','saving'].includes(j.status)))throw Error('A video build is already running');const now=new Date().toISOString(),job={id:randomUUID(),createdBy:userId,createdAt:now,updatedAt:now,status:'queued',stage:'Assembly queued',progress:0,request:{kind:'assembly',title:input.title,clips:structuredClone(input.clips),sourceClips:workspaceClips(state).filter(c=>input.clips.some(p=>p.id===c.id))}};state.jobs.push(job);return job;});}

 return workspace.update(state=>{const project=state.projects.find(p=>p.id===projectId&&!p.trashedAt);if(!project)throw Error('Project not found');if(isFootball365Production(project)){validateFootball365(project,state);if(project.broadcast)validateBroadcastReady(project);if(input.factsReviewed!==true)throw Error('Review the source facts and approve narration generation before building');validateProjectForBuild({...project,audio:null,music:null,srt:'',burnCaptions:false});}else validateProjectForBuild(project);if(state.jobs.some(j=>['queued','running','saving'].includes(j.status)))throw Error('A video build is already running');if(updateJobId&&!state.jobs.some(j=>j.id===updateJobId&&j.status==='complete'&&j.request?.projectId===projectId))throw Error('Choose a completed video from this project');const now=new Date().toISOString(),job={id:randomUUID(),createdBy:userId,createdAt:now,updatedAt:now,status:'queued',stage:'Queued',progress:0,request:{kind:'studio',projectId,project:structuredClone(project),replacesJobId:updateJobId||null}};state.jobs.push(job);return job;});
}
export async function patchWorkspaceJob(workspace,id,patch){
 for(let attempt=0;attempt<4;attempt++){try{return await workspace.update(state=>{const job=state.jobs.find(j=>j.id===id);if(!job)throw Error('Build not found');Object.assign(job,patch,{updatedAt:new Date().toISOString()});return job;});}catch(e){if(attempt===3||!e.message.includes('Another editor'))throw e;}}
}
export async function runWorkspaceRender(workspace,id,{key='',fetcher=fetch}={}){
 const job=await workspace.update(state=>{const j=state.jobs.find(j=>j.id===id);if(!j||j.status!=='queued')throw Error('Build already claimed or unavailable');if(j.cancelRequestedAt){j.status='cancelled';return null;}Object.assign(j,{status:'running',startedAt:new Date().toISOString(),stage:'Preparing saved media',updatedAt:new Date().toISOString()});return structuredClone(j);});if(!job)return;
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'plexa-render-'))),controller=new AbortController();let progress=Promise.resolve();
 const timer=setInterval(()=>{workspace.snapshot().then(({state})=>{if(state.jobs.find(j=>j.id===id)?.cancelRequestedAt)controller.abort();}).catch(()=>controller.abort());},2000);
 try{
  const onProgress=patch=>{progress=progress.then(()=>patchWorkspaceJob(workspace,id,patch));progress.catch(()=>controller.abort());return progress;};
  if(job.request.project&&isFootball365Production(job.request.project))job.request.project=await prepareFootball365(workspace,job.request.project,{root,key,fetcher,jobId:id,signal:controller.signal,onProgress});
  const model=job.request.kind==='assembly'?null:expandBroadcastMedia(validateProjectForBuild(job.request.project),job.request.project.broadcast),assets=new Set();
  function collect(value){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(key==='asset'&&typeof item==='string'&&item)assets.add(assertAssetKey(item));else if(typeof item==='object')collect(item);}}
  collect(model);if(!model)for(const c of job.request.sourceClips)assets.add(assertAssetKey(c.asset));for(const asset of assets){const {bytes}=await workspace.getFile(asset);const file=path.join(root,asset);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}
  let output;if(model)output=await renderScenes(model,{root,assetBoundary:root,signal:controller.signal,onProgress});else{const catalogue=[];for(const c of job.request.sourceClips){const file=path.join(root,c.asset);catalogue.push({...c,file,...await probe(file)});}output=await assemble(job,catalogue,root,controller.signal,onProgress);}if(job.request.project&&isFootball365Production(job.request.project))output=await finishFootball365(output,job.request.project,{root,signal:controller.signal,onProgress});await progress;
  await patchWorkspaceJob(workspace,id,{status:'saving',stage:'Verifying and saving to Studio Library',progress:99});
  const asset='videos/'+id+'.mp4',entry=await workspace.putBytes(asset,await fs.readFile(output.file),{name:output.title||job.request.project?.title||job.request.title,updatedAt:output.updatedAt});await workspace.readFile(entry);
  const {file,metadataFile,...metadata}=output;
  if(model?.audio?.asset){const state=(await workspace.snapshot()).state,record=[...Object.values(state.narrationRecords||{}),...(state.voiceCandidates||[]).map(c=>({...c,generatedAt:c.createdAt}))].find(r=>r.asset===model.audio.asset&&r.voiceId===job.request.project.elevenlabsVoiceId);if(record){metadata.voice=record.voiceName;metadata.voiceId=record.voiceId;metadata.voiceProvenance='elevenlabs-account-generation';metadata.narrationGeneratedAt=record.generatedAt;}}
  // One commit makes the stored MP4 and completed job visible together.
  for(let attempt=0;attempt<4;attempt++){try{await workspace.update(state=>{const current=state.jobs.find(j=>j.id===id);if(current.cancelRequestedAt){controller.abort();throw Error('Cancelled');}if(current.status!=='saving')throw Error('Build is no longer active');state.assets[asset]=entry;current.output={...metadata,asset,url:'/api/studio-workspace/media?asset='+encodeURIComponent(asset)};Object.assign(current,{status:'complete',stage:'Saved to Studio Library',progress:100,updatedAt:new Date().toISOString()});return true;});break;}catch(e){if(attempt===3||!e.message.includes('Another editor'))throw e;}}
 }catch(e){await progress.catch(()=>{});await patchWorkspaceJob(workspace,id,{status:controller.signal.aborted?'cancelled':'failed',stage:controller.signal.aborted?'Cancelled':e.message});throw e;}
 finally{clearInterval(timer);await fs.rm(root,{recursive:true,force:true});}
}
