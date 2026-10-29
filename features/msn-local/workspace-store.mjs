/** Durable workspace state. Conditional commits prevent lost updates across workers. */
import {createHash} from 'node:crypto';
import {createProjectStore} from './projects.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const empty=()=>({version:1,projects:[],templates:[],assets:{},images:[],jobs:[],trash:{},imports:[]});
export function assertAssetKey(key){if(typeof key!=='string'||key.length>4096||!key||key.startsWith('/')||key.includes('\\')||key.split('/').some(p=>!p||p==='..'||p==='.')||['__proto__','prototype','constructor'].includes(key))throw Error('Invalid media path');return key;}
export function createWorkspaceStore(store){
 async function snapshot(){const item=await store.getWithMetadata('workspace.json',{type:'json',consistency:'strong'});if(!item)return {state:empty(),etag:null};if(!item.etag||item.data?.version!==1||!Array.isArray(item.data.projects)||typeof item.data.assets!=='object')throw Error('Workspace data is unavailable or invalid');return {state:structuredClone(item.data),etag:item.etag};}
 async function update(change){const {state,etag}=await snapshot();const value=await change(state);state.updatedAt=new Date().toISOString();const r=await store.setJSON('workspace.json',state,etag?{onlyIfMatch:etag}:{onlyIfNew:true});if(!r.modified)throw Error('Another editor saved changes. Reload before saving; your changes were not written.');return structuredClone(value);}
 const persistence={read:async()=>(await snapshot()).state,update};
 const projects=createProjectStore('/unused',{persistence});
 async function putBytes(asset,bytes,metadata={}){
  assertAssetKey(asset);const chunks=[];
  for(let start=0;start<bytes.length;start+=4*1024*1024){const part=bytes.subarray(start,start+4*1024*1024),sha256=digest(part),key='studio-import/chunks/'+sha256;const r=await store.set(key,part,{onlyIfNew:true});if(!r.modified){const old=await store.get(key,{type:'arrayBuffer',consistency:'strong'});if(old===null||digest(Buffer.from(old))!==sha256)throw Error('Stored media failed integrity check');}chunks.push({key,sha256,bytes:part.length});}
  return {asset,bytes:bytes.length,sha256:digest(bytes),chunks,...metadata};
 }
 async function readFile(entry){if(!entry||!Array.isArray(entry.chunks))throw Error('Media not found');const parts=[];for(const chunk of entry.chunks){if(!/^studio-import\/chunks\/[a-f0-9]{64}$/.test(chunk.key)||chunk.key.split('/').at(-1)!==chunk.sha256)throw Error('Invalid media manifest');const raw=await store.get(chunk.key,{type:'arrayBuffer',consistency:'strong'});if(raw===null)throw Error('Stored media is missing');const part=Buffer.from(raw);if(part.length!==chunk.bytes||digest(part)!==chunk.sha256)throw Error('Stored media failed integrity check');parts.push(part);}const bytes=Buffer.concat(parts);if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw Error('Stored file failed integrity check');return bytes;}
 async function openFile(asset,rangeHeader){
  assertAssetKey(asset);const state=(await snapshot()).state;const entry=Object.hasOwn(state.assets,asset)?state.assets[asset]:null;
  if(!entry||!Array.isArray(entry.chunks)||entry.chunks.reduce((n,c)=>n+c.bytes,0)!==entry.bytes)throw Error('Media not found or invalid');
  const range=byteRange(rangeHeader,entry.bytes);
  async function* stream(){let offset=0;const fullHash=createHash('sha256');for(const c of entry.chunks){const end=offset+c.bytes-1;if(end<range.start||offset>range.end){offset+=c.bytes;continue;}if(!/^studio-import\/chunks\/[a-f0-9]{64}$/.test(c.key)||c.key.split('/').at(-1)!==c.sha256)throw Error('Invalid media chunk');const raw=await store.get(c.key,{type:'arrayBuffer',consistency:'strong'});if(raw===null)throw Error('Stored media is missing');const part=Buffer.from(raw);if(part.length!==c.bytes||digest(part)!==c.sha256)throw Error('Stored media failed integrity check');if(range.status===200)fullHash.update(part);yield new Uint8Array(part.subarray(Math.max(0,range.start-offset),Math.min(c.bytes,range.end-offset+1)));offset+=c.bytes;}if(range.status===200&&fullHash.digest('hex')!==entry.sha256)throw Error('Stored file failed integrity check');}
  return {entry,range,stream:stream()};
 }
 async function getFile(asset){assertAssetKey(asset);const state=(await snapshot()).state;const entry=Object.hasOwn(state.assets,asset)?state.assets[asset]:null;return {entry,bytes:await readFile(entry)};}
 return {snapshot,update,projects,putBytes,readFile,getFile,openFile};
}
/** Return a valid inclusive range, including suffix requests used by media players. */
export function byteRange(header,size){
 if(!Number.isSafeInteger(size)||size<1)throw Error('Empty media');
 if(!header)return {start:0,end:size-1,status:200};
 const match=/^bytes=(\d*)-(\d*)$/.exec(header);if(!match||(!match[1]&&!match[2]))throw Error('Invalid byte range');
 let start,end;if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<1)throw Error('Invalid byte range');start=Math.max(0,size-suffix);end=size-1;}else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw Error('Invalid byte range');return {start,end,status:206};
}
