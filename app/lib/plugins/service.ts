import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getStore } from '@netlify/blobs';
import { shouldUseNetlifyBlobStore } from '@/app/lib/netlify-blob-json';
import { getServerSecretAsync } from '@/app/lib/server-secrets';
import { plugins, connectionStatus, type Health, type Plugin } from './catalog';
const directory=path.join(process.cwd(),'data/local/plugin-health');
async function read(id:string):Promise<Health|undefined> {
 if(shouldUseNetlifyBlobStore()) return (await getStore({name:'plexa-plugin-health',consistency:'strong'}).get(id,{type:'json'}))??undefined;
 try{return JSON.parse(await fs.readFile(path.join(directory,id+'.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
}
async function write(id:string,health:Health){
 if(shouldUseNetlifyBlobStore()){await getStore({name:'plexa-plugin-health',consistency:'strong'}).setJSON(id,health);return;}
 await fs.mkdir(directory,{recursive:true});const target=path.join(directory,id+'.json');const temp=target+'.'+crypto.randomUUID();await fs.writeFile(temp,JSON.stringify(health),{mode:0o600});await fs.rename(temp,target);
}
async function credentials(p:Plugin){const values=await Promise.all(p.secrets.map(k=>getServerSecretAsync(k)));return {values,configured:p.runtime?shouldUseNetlifyBlobStore():values.length>0&&values.every(Boolean),fingerprint:createHash('sha256').update(JSON.stringify(values)).digest('hex')};}
export async function inventory(){return Promise.all(plugins.map(async p=>{const c=await credentials(p);const h=await read(p.id);const matching=h?.fingerprint===c.fingerprint?h:undefined;return {id:p.id,name:p.name,category:p.category,usedBy:p.usedBy,configHref:['netlify','resend'].includes(p.id)?undefined:'/admin/provider-keys-and-platform-services',status:!c.configured&&c.values.some(Boolean)?'Needs Attention':connectionStatus(p,c.configured,h,c.fingerprint),canCheck:c.configured&&!!p.endpoint,checkedAt:matching?.checkedAt,lastSuccess:matching?.lastSuccess,error:!c.configured&&c.values.some(Boolean)?'Configuration is incomplete. Review existing provider settings.':matching?.error,duration:matching?.duration,httpStatus:matching?.httpStatus};}));}
export async function safeCheck(p:Plugin){
 const c=await credentials(p);if(!c.configured||!p.endpoint)throw new Error('A read-only check is not available for this service.');
 const previous=await read(p.id);if(previous&&Date.now()-Date.parse(previous.checkedAt)<30000)throw new Error('Please wait 30 seconds before checking again.');
 await reserve(p.id);
 const headers:Record<string,string>={Accept:'application/json',Authorization:`Bearer ${c.values[0]}`};
 if(p.id==='elevenlabs'){delete headers.Authorization;headers['xi-api-key']=c.values[0]!;}
 if(p.id==='mux')headers.Authorization='Basic '+Buffer.from(c.values.join(':')).toString('base64');
 if(p.id==='runway')headers['X-Runway-Version']='2024-11-06';
 const started=Date.now();let ok=false;let httpStatus:number|undefined;let error:string|undefined;
 try {const response=await fetch(p.endpoint,{method:'GET',headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});httpStatus=response.status;const type=response.headers.get('content-type')||'';ok=response.ok&&type.includes('json');await response.body?.cancel();if(!ok)error=`Verification failed (HTTP ${response.status}). Review credentials and provider permissions.`;}
 catch{error='Provider could not be reached. Check service availability and retry.';}
 const checkedAt=new Date().toISOString();await write(p.id,{fingerprint:c.fingerprint,checkedAt,lastSuccess:ok?checkedAt:previous?.fingerprint===c.fingerprint?previous.lastSuccess:undefined,ok,httpStatus,error,duration:Date.now()-started});
}

async function reserve(id:string){
 const now=Date.now();
 if(shouldUseNetlifyBlobStore()){
  const store=getStore({name:'plexa-plugin-check-leases',consistency:'strong'});
  const current=await store.getWithMetadata(id,{type:'json'});
  if(current && now-(current.data as {started:number}).started<30000)throw new Error('Check already running.');
  if(current&&!current.etag)throw new Error('Storage version unavailable.');
  const result=await store.setJSON(id,{started:now},current?{onlyIfMatch:current.etag!}:{onlyIfNew:true});
  if(!result.modified)throw new Error('Check already running.');return;
 }
 await fs.mkdir(directory,{recursive:true});const lock=path.join(directory,id+'.lock');
 let handle;
 try{handle=await fs.open(lock,'wx');}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const stat=await fs.stat(lock);if(now-stat.mtimeMs<30000)throw new Error('Check already running.');await fs.unlink(lock);handle=await fs.open(lock,'wx');}
 await handle.close();
}
