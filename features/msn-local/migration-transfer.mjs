/** Content-addressed staging: verify every chunk before publishing an import manifest.
 * Inject an authorised object store; never imports credentials or changes active data.
 */
import {createHash} from 'node:crypto';
export const CHUNK_BYTES=4*1024*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function safeAsset(asset){return typeof asset==='string'&&asset.length>0&&asset.length<4096&&!asset.startsWith('/')&&!asset.includes('\\')&&!asset.split('/').some(p=>p==='..'||p==='.'||!p);}
async function chunk(store,bytes){
 const sha256=hash(bytes),key='studio-import/chunks/'+sha256;
 const existing=await store.get(key,{type:'arrayBuffer',consistency:'strong'});
 if(existing!==null){if(hash(Buffer.from(existing))!==sha256)throw Error('Stored media failed verification');return {key,sha256,bytes:bytes.length};}
 const write=await store.set(key,bytes,{onlyIfNew:true});
 if(!write.modified){const concurrent=await store.get(key,{type:'arrayBuffer',consistency:'strong'});if(concurrent===null||hash(Buffer.from(concurrent))!==sha256)throw Error('Concurrent media upload failed verification');}
 const saved=await store.get(key,{type:'arrayBuffer',consistency:'strong'});
 if(saved===null||hash(Buffer.from(saved))!==sha256)throw Error('Uploaded media failed verification');
 return {key,sha256,bytes:bytes.length};
}
export async function stageStudioMigration(store,inventory,readAsset){
 if(inventory.version!==1||!inventory.ready||inventory.missing?.length||!Array.isArray(inventory.files))throw Error('Resolve missing active media before transfer');
 const paths=new Set();for(const f of inventory.files){if(!safeAsset(f.asset)||paths.has(f.asset)||!/^[a-f0-9]{64}$/.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0)throw Error('Invalid migration inventory');paths.add(f.asset);}
 const files=[];
 for(const expected of inventory.files){
  const bytes=await readAsset(expected.asset);
  if(bytes.length!==expected.bytes||hash(bytes)!==expected.sha256)throw Error('Local media changed after inventory: '+expected.asset);
  const chunks=[];for(let start=0;start<bytes.length;start+=CHUNK_BYTES)chunks.push(await chunk(store,bytes.subarray(start,start+CHUNK_BYTES)));
  files.push({asset:expected.asset,bytes:expected.bytes,sha256:expected.sha256,chunks});
 }
 // The import is discoverable only after all files are verified. It does not activate
 // or overwrite existing live projects; merging is a separate guarded operation.
 const manifest={version:1,sourceInventoriedAt:inventory.inventoriedAt,projectCount:inventory.projectCount,completedVideoCount:inventory.completedVideoCount,warnings:inventory.warnings||[],externalAssets:inventory.externalAssets||[],files};
 const id=hash(Buffer.from(JSON.stringify(manifest))),key='studio-import/manifests/'+id+'.json';
 const write=await store.setJSON(key,manifest,{onlyIfNew:true});
 if(!write.modified){const previous=await store.get(key,{type:'json',consistency:'strong'});if(JSON.stringify(previous)!==JSON.stringify(manifest))throw Error('Import manifest conflict');}
 return {id,key,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),activated:false};
}
