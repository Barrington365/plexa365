import animationManifest from '@/public/agents/manifest.json';
import {readAuthData} from '@/app/lib/auth/store';
import {readAgents} from '@/app/lib/agents/store';
import {hostedWorkspace} from '@/app/lib/studio-workspace/store';
import {getServerSecretAsync} from '@/app/lib/server-secrets';
import {accountVoices} from '@/features/msn-local/elevenlabs.mjs';
import {danielBio,defaultVoice,type ProfileSettings} from './model';
export async function profileDirectory(){
 const [auth,agents,{state}]=await Promise.all([readAuthData(),readAgents(),hostedWorkspace().snapshot()]);
 let voices:{id:string;name:string}[]=[],voiceError='';
 try{voices=await accountVoices(await getServerSecretAsync('ELEVENLABS_API_KEY')||'');}catch{voiceError='Voice catalogue unavailable. Existing assignments are retained.';}
 const media=Object.entries(state.assets as Record<string,{name?:string}>).map(([asset,value])=>({asset,name:value.name||asset,url:'/api/studio-workspace/media?asset='+encodeURIComponent(asset)}));
 media.push(...animationManifest.map(a=>({asset:a.url.slice(1),name:a.agent+' · '+a.pose,url:a.url})));
 const settings=(state.identityProfiles||{}) as Partial<Record<string,ProfileSettings>>;
 const base=[
  ...Object.values(auth.users).map(u=>({id:'user:'+u.id,name:u.name,type:'user',brand:'',bio:'',access:u.role+' · '+(u.active?'Active account':'Inactive account'),assets:[] as string[],voiceId:''})),
  ...agents.agents.map(a=>({id:'agent:'+a.id,name:a.name,type:'agent',brand:a.brand,bio:a.responsibility,access:a.state+' · '+(a.workspace||'Workspace unassigned')+' · No autonomous execution',assets:media.filter(m=>m.asset.startsWith('agents/'+a.id+'/')).map(m=>m.asset),voiceId:''})),
  {id:'presenter:daniel-brooks',name:'Daniel Brooks',type:'presenter',brand:'Football365',bio:danielBio,access:'Fictional presenter asset · No login, API, publishing or server permissions',assets:media.filter(a=>a.name.startsWith('Football365-Daniel-Brooks-')).map(a=>a.asset),voiceId:defaultVoice(voices)},
  {id:'presenter:maya-bennett',name:'Maya Bennett',type:'presenter',brand:'Football365',bio:'Profile and assets pending. Voice not assigned.',access:'Fictional presenter asset · No login, API, publishing or server permissions',assets:[] as string[],voiceId:''},
 ];
 return {profiles:base.map(p=>({...p,voiceUseApproved:p.id==='presenter:daniel-brooks',revision:0,...settings[p.id]})),media,voices,voiceError};
}
