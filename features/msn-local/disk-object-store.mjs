/** Local test implementation of the same conditional object-store contract. */
import fs from 'node:fs/promises';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {assertAssetKey} from './workspace-store.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function diskObjectStore(root){
 const file=key=>path.join(root,assertAssetKey(key));
 async function raw(key){try{return await fs.readFile(file(key));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async function set(key,value,options={}){
  const target=file(key);await fs.mkdir(path.dirname(target),{recursive:true});let lock;
  try{lock=await fs.open(target+'.lock','wx');}catch(e){if(e.code==='EEXIST')return {modified:false};throw e;}
  const temp=target+'.'+randomUUID()+'.tmp';
  try{const previous=await raw(key);if(options.onlyIfNew&&previous!==null||options.onlyIfMatch&&(previous===null||hash(previous)!==options.onlyIfMatch))return {modified:false};const bytes=Buffer.from(value);await fs.writeFile(temp,bytes);await fs.rename(temp,target);return {modified:true,etag:hash(bytes)};}
  finally{await lock.close();await fs.rm(target+'.lock',{force:true});await fs.rm(temp,{force:true});}
 }
 return {set,setJSON:(k,v,o)=>set(k,JSON.stringify(v),o),async get(k,{type}={}){const bytes=await raw(k);if(bytes===null)return null;return type==='json'?JSON.parse(bytes.toString('utf8')):bytes;},async getWithMetadata(k,{type}={}){const bytes=await raw(k);if(bytes===null)return null;return {data:type==='json'?JSON.parse(bytes.toString('utf8')):bytes,etag:hash(bytes)};}};
}
