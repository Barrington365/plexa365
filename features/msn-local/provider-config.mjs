import fs from 'node:fs/promises';
import path from 'node:path';
/** Mirrors the main Studio's environment -> local Admin settings precedence.
 * Local project configuration only. Never searches other projects or remote stores.
 */
export async function localElevenLabsConfig(repo,env=process.env){
 let settings={};
 try{settings=JSON.parse(await fs.readFile(path.join(repo,'data/local/admin-settings.json'),'utf8'));}
 catch(e){if(e.code!=='ENOENT')throw Error('Local Admin settings could not be loaded.');}
 const key=env.ELEVENLABS_API_KEY?.trim()||settings.elevenlabsApiKey?.trim()||'';
 return {key,voiceId:env.ELEVENLABS_VOICE_ID?.trim()||settings.elevenlabsVoiceId?.trim()||'',source:key?(env.ELEVENLABS_API_KEY?.trim()?'project environment':'Studio Admin settings'):'not configured'};
}
