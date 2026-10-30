import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {FOOTBALL365 as preset,FOOTBALL365_PROFILE,isFootball365Production,productionRecipe,fullVideoSrt} from './football365-profile.mjs';
import {accountVoices,timedPlan} from './elevenlabs.mjs';
import {trialText,cleanTrialAlignment,generateVoiceSource,assembleCandidate} from './voice-review.mjs';
import {probe,run} from './engine.mjs';
export function validateFootball365(p){
 if(!isFootball365Production(p))throw Error('Choose Football365 News Studio automation');
 if(p.width!==1920||p.height!==1080||p.fps!==30)throw Error('Football365 News Studio requires 1920 × 1080 at 30 fps');
 if(!p.script?.trim())throw Error('Add and review the new article script before building');
 trialText(p.script.trim(),'subtle');
 if(p.script.trim().split(/\n\s*\n/).length!==p.scenes.length)throw Error('Use one narration paragraph per scene');
 if(!p.music?.asset)throw Error('Choose a backing track for Football365 News Studio');
}
export async function prepareFootball365(w,p,{root,key,fetcher=fetch,jobId,signal,onProgress}){
 validateFootball365(p);const preset=productionRecipe(p);const script=p.script.trim(),local=new Map();
 async function media(asset){if(local.has(asset))return local.get(asset);const f=path.join(root,asset);await fs.mkdir(path.dirname(f),{recursive:true});await fs.writeFile(f,(await w.getFile(asset)).bytes);local.set(asset,f);return f;}
 // Resolve required media before any paid generation. Never silently omit branding.
 for(const clip of [preset.intro,preset.outro]){const meta=await probe(await media(clip.asset));if(meta.duration+.01<clip.duration)throw Error('Football365 intro/outro is too short');}
 const musicFile=await media(p.music.asset);let musicLog;try{musicLog=await run(['-hide_banner','-i',musicFile]);}catch(e){musicLog=e.message;}
 const md=musicLog.match(/Duration: (\d+):(\d+):([\d.]+)/);if(!md||!musicLog.includes('Audio:'))throw Error('Backing music is unreadable');const musicDuration=Number(md[1])*3600+Number(md[2])*60+Number(md[3]);
 const coverage=new Map();for(const s of p.scenes){if(s.video?.asset)coverage.set(s.video.asset,await probe(await media(s.video.asset)));for(const l of s.layers||[])if(l.asset)await media(l.asset);}
 for(const story of p.broadcast?.stories||[])for(const asset of story.rightAssets)await media(asset);
 let state=(await w.snapshot()).state;
 let record=(state.voiceCandidates||[]).find(c=>c.projectId===p.id&&c.tagEdit&&c.asset===p.audio?.asset&&c.script===script&&c.voiceId===preset.voiceId&&c.model===preset.model&&state.voiceEditorialEvents?.some(e=>e.type==='candidate-applied'&&e.candidateId===c.id)) || (state.voiceCandidates||[]).find(c=>c.script===script&&c.voiceId===preset.voiceId&&c.model===preset.model&&c.trial==='subtle'&&c.settings.speed===.9&&c.settings.stability===.5&&c.settings.style===.15&&c.settings.pause===0);
 if(!record){
  if(signal?.aborted)throw Error('Cancelled');
  const voice=(await accountVoices(key,fetcher)).find(v=>v.id===preset.voiceId);if(!voice)throw Error('Selected Football365 voice is unavailable to the connected account. No voice substitution made.');
  await onProgress({stage:'Generating '+preset.voiceName+' with subtle tags',progress:5});
  const payload={text:trialText(script,'subtle'),model_id:preset.model,voice_settings:{speed:.9,stability:.5,style:.15,similarity_boost:.75,use_speaker_boost:false},seed:365};
  const source=await generateVoiceSource(w,{voiceId:preset.voiceId,payload,trial:'subtle'},key,fetcher,jobId);
  const alignment=cleanTrialAlignment(script,source.alignment);timedPlan(script,alignment,source.duration,p.scenes,p.fps);
  const id=randomUUID(),audio=await assembleCandidate(w,[{text:script,asset:source.asset,start:0,end:source.duration,settings:preset.settings,profile:'journalist',alignment}],id);
  record={...audio,id,projectId:p.id,projectRevision:p.updatedAt,sourceScript:script,profile:'journalist',settings:preset.settings,voiceId:preset.voiceId,voiceName:voice.name,model:preset.model,trial:'subtle',directedText:payload.text,createdAt:new Date().toISOString(),status:'generated-for-approved-build'};
  await w.update(s=>{s.voiceCandidates??=[];s.voiceCandidates.push(record);return true;});
 }
 if(signal?.aborted)throw Error('Cancelled');
 await media(record.asset);
 const plan=timedPlan(script,record.alignment,record.duration,p.scenes,p.fps);
 for(const s of plan.scenes)if(s.video?.asset&&!s.video.loop&&s.duration+(s.video.start||0)>coverage.get(s.video.asset).duration+.01)throw Error('Narration exceeds background footage. Extend scene coverage; generated audio is retained.');
 if(!p.music.loop&&plan.duration+(p.music.start||0)>musicDuration+.01)throw Error('Backing track is shorter than narration. Choose longer music; generated audio is retained.');
 const music={...p.music,end:(p.music.start||0)+plan.duration,timelineStart:0,fadeIn:Math.min(1.5,plan.duration/2),fadeOut:Math.min(4,plan.duration/2)};
 // Save with optimistic concurrency, retaining source/intro distinction in the editor.
 const saved=await w.projects.save(p.id,{script,scenes:plan.scenes,audio:{asset:record.asset,volume:1},audioLabel:preset.voiceName+' · subtle tags · '+record.createdAt,voice:record.voiceName,elevenlabsVoiceId:preset.voiceId,srt:plan.srt,music},p.updatedAt);
 await w.update(s=>{const job=s.jobs.find(j=>j.id===jobId);job.request.project=structuredClone(saved);job.updatedAt=new Date().toISOString();return true;});
 return saved;
}
export async function finishFootball365(story,p,{root,signal,onProgress}){
 onProgress({stage:'Adding Football365 intro and outro',progress:92});const files=[path.join(root,preset.intro.asset),story.file,path.join(root,preset.outro.asset)],durations=[preset.intro.duration,story.expectedDuration,preset.outro.duration];
 // Encode only the six seconds of branding. The body already has finished
 // captions and audio; encoding it again can exhaust the background-worker limit.
 const segments=[];
 for(let i=0;i<3;i++){
  if(i===1){segments.push(files[i]);continue;}
  const meta=await probe(files[i]),clip=path.join(root,`football365-brand-${i}.mp4`);
  const filters=[`[0:v]trim=duration=${durations[i]},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,format=yuv420p[v]`,meta.audio?`[0:a]atrim=duration=${durations[i]},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${durations[i]}[a]`:`anullsrc=r=48000:cl=stereo,atrim=duration=${durations[i]}[a]`];
  await run(['-y','-filter_complex_threads','1','-i',files[i],'-filter_complex',filters.join(';'),'-map','[v]','-map','[a]','-c:v','libx264','-preset','veryfast','-crf','20','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',clip],{signal});segments.push(clip);
 }
 const manifest=path.join(root,'football365-concat.txt');
 await fs.writeFile(manifest,segments.map((f,i)=>`file '${f.replace(/'/g,"'\\''")}'\nduration ${durations[i]}`).join('\n'));
 const file=path.join(root,'football365-complete.mp4');
 await run(['-y','-f','concat','-safe','0','-i',manifest,'-map','0:v:0','-map','0:a:0','-c','copy','-movflags','+faststart',file],{signal});
 const expectedDuration=durations.reduce((a,b)=>a+b,0),meta=await probe(file);if(meta.width!==1920||meta.height!==1080||!meta.audio||Math.abs(meta.duration-expectedDuration)>.15)throw Error('Full Football365 video validation failed');await run(['-v','error','-i',file,'-f','null','-'],{signal});
 return {...story,...meta,file,expectedDuration,productionProfile:p.productionProfile,introDuration:preset.intro.duration,outroDuration:preset.outro.duration,srt:fullVideoSrt(p.srt),updatedAt:new Date().toISOString()};
}
