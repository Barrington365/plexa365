import {probe} from './engine.mjs';
/** Read-only inventory: no uploads, credentials or changes to local projects. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const media=/\.(png|jpe?g|webp|svg|mp[34]|m4a|wav|ogg|flac|mov|webm|mkv)$/i;
export async function migrationInventory(root,{externalMediaRoots=[],brandKitsFile=null}={}){
 const base=await fs.realpath(root),files=new Map(),missing=[],warnings=[],references=[],externalAssets=[];
 async function add(relative,required=true){
  if(typeof relative!=='string'||!relative)return;
  const key=path.isAbsolute(relative)?path.relative(base,relative):relative;
  if(key==='..'||key.startsWith('../')||path.isAbsolute(key)||key.includes('\\')){missing.push({asset:relative,reason:'Outside Studio media root; requires explicit import'});return;}
  if(files.has(key))return;
  try{const file=await fs.realpath(path.join(base,key));if(!file.startsWith(base+path.sep))throw Error('Symlink leaves media root');const stat=await fs.stat(file);if(!stat.isFile())throw Error('Not a file');const bytes=await fs.readFile(file);files.set(key,{asset:key,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  catch(e){if(required||e.code!=='ENOENT')missing.push({asset:key,reason:e.code==='ENOENT'?'File missing':e.message});}
 }
 async function json(key,fallback){try{return JSON.parse(await fs.readFile(path.join(base,key),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
 async function walk(dir){for(const e of await fs.readdir(path.join(base,dir),{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){const key=path.posix.join(dir,e.name);if(e.isDirectory())await walk(key);else if(media.test(e.name)||dir==='images/original-files'&&e.name.endsWith('.bin')||dir.startsWith('projects/')&&e.name==='project.json')await add(key);}}
 const store=await json('studio/projects.json',{projects:[],templates:[]}),jobs=await json('jobs.json',[]);
 function collect(value,owner){if(!value||typeof value!=='object')return;for(const [key,v] of Object.entries(value)){if(key==='asset'&&typeof v==='string'&&v){references.push({owner,asset:v});}else if(typeof v==='object')collect(v,owner);}}
 for(const project of store.projects){const start=references.length;collect(project,'project:'+project.id);for(const ref of references.slice(start))ref.trashed=!!project.trashedAt;}
 for(const template of store.templates)collect(template,'template:'+template.id);
 for(const job of jobs){collect(job.request,'job:'+job.id);if(job.status==='complete'&&job.output?.file)references.push({owner:'job-output:'+job.id,asset:job.output.file});}
 for(const ref of references){const start=missing.length;await add(ref.asset);if(ref.trashed)warnings.push(...missing.splice(start).map(item=>({...item,owner:ref.owner,reason:item.reason+' (trashed draft)'})));}
 for(const dir of ['images','projects','uploads','videos','brand-assets'])await walk(dir);
 const registry=await json('asset-registry.json',{});
 const allowed=await Promise.all(externalMediaRoots.map(p=>fs.realpath(p)));
 for(const [source,id] of Object.entries(registry)){
  if(!/^asset-\d+$/.test(id)||!media.test(source)){missing.push({asset:source,reason:'Invalid registered media'});continue;}
  try{const real=await fs.realpath(source);if(!allowed.some(dir=>real.startsWith(dir+path.sep)))throw Error('Registered media requires an explicitly allowed source directory');const bytes=await fs.readFile(real),asset='imported-clips/'+id+path.extname(real).toLowerCase();files.set(asset,{asset,sourceFile:real,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});externalAssets.push({id,asset,name:path.basename(real),...(path.extname(real).toLowerCase()==='.mp4'?await probe(real):{})});}
  catch(e){missing.push({asset:source,reason:e.code==='ENOENT'?'Registered source clip missing':e.message});}
 }
 if(brandKitsFile){try{const bytes=await fs.readFile(brandKitsFile);if(!Array.isArray(JSON.parse(bytes.toString('utf8'))))throw Error('Invalid brand kits');const asset='configuration/brand-kits.json';files.set(asset,{asset,sourceFile:await fs.realpath(brandKitsFile),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}catch(e){if(e.code!=='ENOENT')throw e;}}
 for(const key of ['studio/projects.json','studio/article-inbox.json','jobs.json','images/catalogue.json','uploads/catalogue.json','library-trash.json'])await add(key,false);
 return {version:1,inventoriedAt:new Date().toISOString(),projectCount:store.projects.length,templateCount:store.templates.length,completedVideoCount:jobs.filter(j=>j.status==='complete').length,files:[...files.values()].sort((a,b)=>a.asset.localeCompare(b.asset)),references,externalAssets,missing,warnings,ready:missing.length===0,totalBytes:[...files.values()].reduce((n,f)=>n+f.bytes,0)};
}
