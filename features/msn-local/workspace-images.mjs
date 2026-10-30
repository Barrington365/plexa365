import {retryImportConflict} from './article-url.mjs';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {imageLibrary} from './images.mjs';import {assertAssetKey} from './workspace-store.mjs';
/** Run existing image edits in an isolated scratch directory, then publish immutable results. */
export async function workspaceImage(workspace,action,body){
 const {state}=await workspace.snapshot();const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'plexa-image-')));
 try{
  await fs.mkdir(path.join(root,'images'),{recursive:true});await fs.writeFile(path.join(root,'images/catalogue.json'),JSON.stringify(state.images));
  if(action!=='import'){
   const image=body.id?state.images.find(i=>i.id===body.id):null;const asset=image?'images/'+image.id+'.png':body.asset;if(!asset)throw Error('Image not found');assertAssetKey(asset);const {bytes}=await workspace.getFile(asset);const file=path.join(root,asset);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);
  }
  const library=imageLibrary(root,process.cwd());
  if(action==='preview')return await library.preview(body);
  let image;
  if(action==='import'){if(typeof body.base64!=='string'||!/^[A-Za-z0-9+/=]+$/.test(body.base64))throw Error('Choose a valid image');image=await library.upload(Buffer.from(body.base64,'base64'),body.name,body.sourceUrl,body.parentId);}
  else if(action==='edit')image=await library.edit(body);else throw Error('Unknown image action');
  const asset='images/'+image.id+'.png',entry=await workspace.putBytes(asset,await fs.readFile(library.file(image)),{name:image.name,updatedAt:image.updatedAt});
  let originalEntry;if(action==='import'){const originalAsset='images/original-files/'+image.id+'.bin';originalEntry=await workspace.putBytes(originalAsset,await fs.readFile(path.join(root,originalAsset)),{updatedAt:image.updatedAt});}
  await retryImportConflict(()=>workspace.update(s=>{s.assets[asset]=entry;if(originalEntry)s.assets[originalEntry.asset]=originalEntry;if(!s.images.some(i=>i.id===image.id))s.images.push(image);return true;}));
  return action==='import'?image:{image,asset};
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
