import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {removeBackground} from './background-removal.mjs';
import sharp from 'sharp';
export function imageLibrary(root,repo,{backgroundRemover=removeBackground}={}){
 const dir=path.join(root,'images'), manifest=path.join(dir,'catalogue.json');let chain=Promise.resolve(),busy=false;
 const list=async()=>JSON.parse(await fs.readFile(manifest,'utf8').catch(e=>{if(e.code==='ENOENT')return '[]';throw e;}));
 const add=asset=>{const task=chain.then(async()=>{const items=await list();items.push(asset);await fs.writeFile(manifest+'.tmp',JSON.stringify(items,null,2));await fs.rename(manifest+'.tmp',manifest);return asset;});chain=task.catch(()=>{});return task;};
 const get=async id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Image not found');const a=(await list()).find(a=>a.id===id);if(!a)throw Error('Image not found');return a;};
 const file=a=>path.join(dir,a.id+'.png');
 async function upload(bytes,name,sourceUrl='',parentId=null) {await fs.mkdir(dir,{recursive:true});if(bytes.length>14e6)throw Error('Choose an image under 14 MB');const parent=parentId?await get(parentId):null;if(parent&&parent.kind!=='original')throw Error('Choose an original image as the parent');if(parent)sourceUrl=parent.sourceUrl;const id=randomUUID();const result=await sharp(bytes,{limitInputPixels:24000000}).rotate().png().toBuffer({resolveWithObject:true});const asset={id,name:String(name||'Article image').slice(0,150),kind:parent?'edited':'original',...(parent?{parentId:parent.id}:{}),width:result.info.width,height:result.info.height,sourceUrl:/^https?:\/\//.test(sourceUrl)?sourceUrl.slice(0,2000):'',updatedAt:new Date().toISOString()};await fs.mkdir(path.join(dir,'original-files'),{recursive:true});await fs.writeFile(path.join(dir,'original-files',id+'.bin'),bytes);asset.originalFilePreserved=true;await fs.writeFile(file(asset),result.data);return add(asset);}
 async function remove(id,crop){if(busy)throw Error('A cutout is already processing. Please wait.');busy=true;let temp;try{const original=await get(id);const target={id:randomUUID(),name:original.name.replace(/\.[^.]+$/,'')+' · cutout',kind:'cutout',parentId:original.id,sourceUrl:original.sourceUrl,method:'U²-Net · Studio foreground mask'};let input=file(original);if(crop){const {left,top,width,height}=crop;if(![left,top,width,height].every(Number.isInteger)||left<0||top<0||width<20||height<20||left+width>original.width||top+height>original.height)throw Error('Crop must fit inside the original image');temp=path.join(dir,randomUUID()+'.tmp.png');await sharp(input).extract(crop).png().toFile(temp);input=temp;target.crop=crop;}
 const result=await backgroundRemover(await fs.readFile(input));await fs.writeFile(file(target),result);const meta=await sharp(file(target)).metadata();const stats=await sharp(file(target)).stats();if(!meta.hasAlpha||stats.channels.at(-1).min===255)throw Error('No transparent background found. Try cropping closer to the player.');Object.assign(target,{width:meta.width,height:meta.height,updatedAt:new Date().toISOString()});return await add(target);
 }finally{busy=false;if(temp)await fs.rm(temp,{force:true});}}
 function operations(input){
  const rotate=input.rotate??0;
  if(![0,90,180,270].includes(rotate))throw Error('Rotate by 0, 90, 180 or 270 degrees');
  const brightness=Math.round(input.brightness??0),contrast=Math.round(input.contrast??0);
  if(!Number.isInteger(brightness)||brightness<-100||brightness>100)throw Error('Brightness must be a whole number from -100 to 100');
  if(!Number.isInteger(contrast)||contrast<-100||contrast>100)throw Error('Contrast must be a whole number from -100 to 100');
  let crop=null;
  if(input.crop){const {left,top,width,height}=input.crop;if(![left,top,width,height].every(Number.isInteger)||left<0||top<0||width<1||height<1)throw Error('Crop must fit inside the image');crop={left,top,width,height};}
  return {rotate,flipX:!!input.flipX,flipY:!!input.flipY,brightness,contrast,crop};
 }
 function unchanged(ops){return ops.rotate===0&&!ops.flipX&&!ops.flipY&&ops.brightness===0&&ops.contrast===0&&!ops.crop;}
 async function resolveImage(asset){
  if(typeof asset!=='string'||asset.includes('\\')||asset.startsWith('/')||asset.split('/').includes('..'))throw Error('Choose a Library image');
  if(!['.png','.jpg','.jpeg','.webp'].includes(path.extname(asset).toLowerCase()))throw Error('Choose a Library image');
  const base=await fs.realpath(root),target=await fs.realpath(path.join(root,asset));
  if(!target.startsWith(base+path.sep)||(await fs.stat(target)).isDirectory())throw Error('Asset outside Library');
  return target;
 }
 async function sourceOf(input){
  if(input.id){const parent=await get(input.id);if(parent.kind==='cutout')throw Error('Cutouts stay in the Library. Edit the source image.');return {parent,sourceFile:file(parent),sourceAsset:'images/'+parent.id+'.png'};}
  if(typeof input.asset!=='string')throw Error('Choose an image to edit');
  const sourceFile=await resolveImage(input.asset);
  const match=input.asset.match(/^images\/([0-9a-f-]{36})\.png$/);
  const parent=match?(await list()).find(a=>a.id===match[1])||null:null;
  if(parent?.kind==='cutout')throw Error('Cutouts stay in the Library. Edit the source image.');
  return {parent,sourceFile,sourceAsset:input.asset};
 }
 async function renderEdit(sourceFile,ops){
  let pipeline=sharp(sourceFile,{limitInputPixels:24000000});
  if(ops.rotate)pipeline=pipeline.rotate(ops.rotate);
  if(ops.flipY)pipeline=pipeline.flip();
  if(ops.flipX)pipeline=pipeline.flop();
  if(ops.crop||ops.brightness||ops.contrast){
   const base=await pipeline.png().toBuffer();
   pipeline=sharp(base,{limitInputPixels:24000000});
   if(ops.crop)pipeline=pipeline.extract(ops.crop);
   const brightness=Math.max(0.01,1+ops.brightness/100),contrast=1+ops.contrast/100;
   if(ops.brightness)pipeline=pipeline.modulate({brightness});
   if(ops.contrast)pipeline=pipeline.linear(contrast,Math.round(-(128*(contrast-1))));
  }
  try{return await pipeline.png().toBuffer({resolveWithObject:true});}
  catch(e){if(ops.crop&&/extract/i.test(e.message))throw Error('Crop must fit inside the image');throw e;}
 }
 async function preview(input){
  const ops=operations(input),{sourceFile}=await sourceOf(input);
  if(unchanged(ops))return fs.readFile(sourceFile);
  const before=await list();
  try{return (await renderEdit(sourceFile,ops)).data;}
  finally{if((await list()).length!==before.length)throw Error('Preview changed the Library');}
 }
 async function edit(input){
  const ops=operations(input);
  if(unchanged(ops))throw Error('Change the image before applying');
  const {parent,sourceFile,sourceAsset}=await sourceOf(input);
  const before=await fs.readFile(sourceFile);
  const originalUpdatedAt=parent?.updatedAt;
  let rendered;
  try{rendered=await renderEdit(sourceFile,ops);}catch(e){if(!Buffer.compare(await fs.readFile(sourceFile),before))throw e;throw Error('The original image was left unchanged, but the edit failed');}
  if(Buffer.compare(await fs.readFile(sourceFile),before))throw Error('The original image was modified');
  const id=randomUUID();
  const rootParent=parent?parent.kind==='edited'?parent.parentId:parent.id:null;
  const asset={id,name:String(input.name||((parent?.name||path.basename(sourceAsset)).replace(/\.[^.]+$/,'')+' · edit')).slice(0,150),kind:'edited',...(rootParent?{parentId:rootParent}:{}),sourceAsset,operations:ops,width:rendered.info.width,height:rendered.info.height,sourceUrl:parent?.sourceUrl||'',updatedAt:new Date().toISOString()};
  await fs.writeFile(file(asset),rendered.data);
  try{const saved=await add(asset);if(parent&&(await get(parent.id)).updatedAt!==originalUpdatedAt)throw Error('Original update time changed');return saved;}
  catch(e){await fs.rm(file(asset),{force:true});throw e;}
 }
 return {list,get,file,upload,remove,preview,edit};
}
