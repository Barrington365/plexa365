/** Explicit local ElevenLabs connection. Keys stay in process memory; never in projects or logs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {uploadStudioAsset} from './studio-assets.mjs';
import {run} from './engine.mjs';
export async function audioInfo(file){let log;try{log=await run(['-hide_banner','-i',file]);}catch(e){log=e.message;}const m=log.match(/Duration: (\d+):(\d+):([\d.]+)/);if(!m||!log.includes('Audio:'))throw Error('Generated audio is unreadable.');return {audio:true,duration:+m[1]*3600 + +m[2]*60 + +m[3]};}

const model='eleven_multilingual_v2';
export async function accountVoices(key,fetcher=fetch){
 if(!key)throw Error('Connect ElevenLabs in Audio before generating narration.');
 const found=new Map(),seen=new Set();let token;
 do{
  const u=new URL('https://api.elevenlabs.io/v2/voices');u.searchParams.set('page_size','100');if(token)u.searchParams.set('next_page_token',token);
  const r=await fetcher(u,{headers:{'xi-api-key':key},signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error(`ElevenLabs voice list failed (HTTP ${r.status}). Check voice-read permission and account access.`);
  const d=await r.json();if(!Array.isArray(d.voices))throw Error('ElevenLabs returned an invalid voice list.');
  for(const v of d.voices)if(typeof v.voice_id==='string'&&typeof v.name==='string')found.set(v.voice_id,{id:v.voice_id,name:v.name,category:v.category||'unknown'});
  if(!d.has_more)break;
  token=d.next_page_token;if(!token||seen.has(token)||seen.size>=100)throw Error('ElevenLabs pagination incomplete. No partial voice list is used.');seen.add(token);
 }while(true);
 return [...found.values()];
}
const stamp=t=>{const n=Math.round(t*1000);return `${String(Math.floor(n/3600000)).padStart(2,'0')}:${String(Math.floor(n/60000)%60).padStart(2,'0')}:${String(Math.floor(n/1000)%60).padStart(2,'0')},${String(n%1000).padStart(3,'0')}`;};
export function timedPlan(script,alignment,duration,scenes,fps=30,{continuousScene=false}={}){
 const a=alignment;if(!a||!Array.isArray(a.characters)||a.characters.join('')!==script)throw Error('Provider timing does not match the script. Audio retained; review alignment before retrying.');
 const starts=a.character_start_times_seconds,ends=a.character_end_times_seconds;
 if(starts?.length!==a.characters.length||ends?.length!==starts.length)throw Error('Incomplete narration timestamps.');
 for(let i=0;i<starts.length;i++)if(!Number.isFinite(starts[i])||!Number.isFinite(ends[i])||starts[i]<0||ends[i]<starts[i]||ends[i]>duration+.1||(i&&starts[i]<starts[i-1]))throw Error('Invalid narration timestamps.');
 const words=[...script.matchAll(/\S+/g)].map(m=>({text:m[0],start:starts[m.index],end:ends[m.index+m[0].length-1]}));
 const cues=[];let cue;
 for(const w of words){if(cue&&(cue.text.length+w.text.length>72||w.end-cue.start>5)){cues.push(cue);cue=null;}if(!cue)cue={...w};else{cue.text+=' '+w.text;cue.end=w.end;}if(/[.!?]$/.test(w.text)){cues.push(cue);cue=null;}}
 if(cue)cues.push(cue);if(!cues.length||cues.some(c=>c.end<=c.start))throw Error('Missing timed speech.');
 for(let i=1;i<cues.length;i++)if(cues[i].start<cues[i-1].end)cues[i-1].end=cues[i].start;
 const paragraphs=[...script.matchAll(/\S[^]*?(?=\n\s*\n|$)/g)];
 const continuous=continuousScene&&scenes.length===1;
 if(!continuous&&paragraphs.length!==scenes.length)throw Error('Use one script paragraph per scene before generating.');
 const totalFrames=Math.ceil((duration+.25)*fps),boundaries=[0,...(continuous?[]:paragraphs.slice(1).map(m=>Math.round(starts[m.index]*fps))),totalFrames];
 const next=scenes.map((s,i)=>({...s,duration:(boundaries[i+1]-boundaries[i])/fps}));
 if(next.some(s=>s.duration<.2||s.duration>1200))throw Error('Narration produced an unsupported scene duration.');
 return {scenes:next,srt:cues.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join('\n\n'),duration:totalFrames/fps};
}
export function createElevenLabs({root,projects,fetcher=fetch,initialKey=process.env.ELEVENLABS_API_KEY||''}){
 let key=initialKey,busy=false;
 const dir=path.join(root,'narration');
 return {
  status:()=>({configured:!!key,busy}),
  async connect(candidate){if(busy)throw Error('Narration generation is in progress.');if(typeof candidate!=='string'||candidate.length<10||candidate.length>512||/[\s]/.test(candidate))throw Error('Enter a valid ElevenLabs API key.');const voices=await accountVoices(candidate,fetcher);key=candidate;return {configured:true,voices};},
  async voices(){return {voices:await accountVoices(key,fetcher),updatedAt:new Date().toISOString()};},
  async generate({projectId,voiceId,expectedUpdatedAt}){
   if(busy)throw Error('A narration is already being generated.');if(!key)throw Error('Connect ElevenLabs in Audio first.');busy=true;
   try{
    const p=await projects.get(projectId);if(p.trashedAt||p.updatedAt!==expectedUpdatedAt)throw Error('Project changed. Reload before generating.');
    const script=p.script?.trim();if(!script||script.length>10000)throw Error('Use a script of 1–10,000 characters.');
    if(script.split(/\n\s*\n/).length!==p.scenes.length)throw Error('Use one script paragraph per scene.');
    if(p.scenes.some(s=>s.video?.asset)||p.music?.asset)throw Error('Automatic narration timing currently supports image scenes without music. Retain this project and use a separate draft for those tracks.');
    const voices=await accountVoices(key,fetcher),voice=voices.find(v=>v.id===voiceId);if(!voice)throw Error('Selected voice is not available to this account. No audio generated.');
    const hash=createHash('sha256').update(JSON.stringify({projectId,script,voiceId,model})).digest('hex');await fs.mkdir(dir,{recursive:true});const cache=path.join(dir,hash+'.json'),marker=path.join(dir,hash+'.pending');
    let stored=JSON.parse(await fs.readFile(cache,'utf8').catch(()=> 'null'));
    if(!stored){
     try{await fs.writeFile(marker,new Date().toISOString(),{flag:'wx'});}catch{throw Error('This generation has an unresolved prior request. Check ElevenLabs history before retrying to avoid duplicate charges.');}
     let r;try{r=await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({text:script,model_id:model}),signal:AbortSignal.timeout(120000)});}catch{throw Error('ElevenLabs response was interrupted. Check generation history before retrying; no automatic paid retry was made.');}
     if(!r.ok){if(r.status>=400&&r.status<500)await fs.rm(marker,{force:true});throw Error(`ElevenLabs generation failed (HTTP ${r.status}). Check Text to Speech access, voice entitlement and credits.`);}
     const d=await r.json();if(typeof d.audio_base64!=='string')throw Error('ElevenLabs did not return audio. Check generation history.');
     const asset=await uploadStudioAsset(root,{name:`${voice.name} · ${p.title}.mp3`,base64:d.audio_base64});
     stored={asset:asset.asset,voiceId,voiceName:voice.name,model,script,alignment:d.alignment||d.normalized_alignment,generatedAt:new Date().toISOString()};
     await fs.writeFile(cache+'.tmp',JSON.stringify(stored));await fs.rename(cache+'.tmp',cache);await fs.rm(marker,{force:true});
    }
    const info=await audioInfo(path.join(root,stored.asset));if(!info.audio||!Number.isFinite(info.duration)||info.duration<.2)throw Error('Generated audio is unreadable.');
    const plan=timedPlan(script,stored.alignment,info.duration,p.scenes,p.fps);
    const saved=await projects.save(p.id,{script,voice:voice.name,elevenlabsVoiceId:voiceId,audioLabel:`${voice.name} · ElevenLabs · ${stored.generatedAt}`,audio:{asset:stored.asset,volume:1},srt:plan.srt,scenes:plan.scenes},p.updatedAt);
    return {project:saved,narration:{voiceId,voiceName:voice.name,duration:info.duration,generatedAt:stored.generatedAt},rebuildRequired:true};
   }finally{busy=false;}
  }
 };
}
