/** Extract a real video frame. The MP4 is left unchanged. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {run} from './engine.mjs';
import {chooseFrame,resolveLibraryTarget} from './video-library.mjs';
function captureSeconds(value,duration){
 const seconds=Number(value);
 if(!Number.isFinite(seconds)||seconds<0)throw Error('Choose a frame in the video');
 if(duration!=null&&seconds>duration+0.05)throw Error('That time is past the end of the video');
 return Math.min(seconds,duration??seconds);
}
async function still(bytes,seconds){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'plexa-thumb-'));
 try{
  const input=path.join(dir,'source.mp4'),frame=path.join(dir,'frame.jpg');
  await fs.writeFile(input,bytes);
  await run(['-hide_banner','-y','-i',input,'-ss',captureSeconds(seconds).toFixed(3),'-frames:v','1','-q:v','2',frame]);
  const original=await fs.readFile(frame),meta=await sharp(original).metadata();
  if(!meta.width||!meta.height)throw Error('The captured frame has no picture');
  const list=await sharp(original).resize({width:640,withoutEnlargement:true}).webp({quality:80}).toBuffer();
  const stats=await sharp(original).stats();
  return {original,list,width:meta.width,height:meta.height,mean:stats.channels[0]?.mean??0,r:stats.channels[0]?.mean??0,g:stats.channels[1]?.mean??0,b:stats.channels[2]?.mean??0};
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
async function storePair(workspace,stillImage,source,seconds){
 const id=randomUUID(),updatedAt=new Date().toISOString(),asset=`thumbnails/${id}.jpg`,listAsset=`thumbnails/${id}.webp`;
 const originalEntry=await workspace.putBytes(asset,stillImage.original,{name:'Video thumbnail',updatedAt});
 const listEntry=await workspace.putBytes(listAsset,stillImage.list,{name:'Video thumbnail preview',updatedAt});
 return {entries:[originalEntry,listEntry],draft:{asset,listAsset,seconds:seconds==null?null:Number(Number(seconds).toFixed(3)),width:stillImage.width,height:stillImage.height,updatedAt,source}};
}
export async function captureVideoFrame(workspace,body){
 const {state}=await workspace.snapshot(),target=resolveLibraryTarget(state,body),seconds=captureSeconds(body.seconds,target.duration);
 const file=await workspace.getFile(target.asset),image=await still(file.bytes,seconds);
 return {...await storePair(workspace,image,'capture',seconds),key:target.key};
}
export async function suggestVideoFrame(workspace,body){
 const {state}=await workspace.snapshot(),target=resolveLibraryTarget(state,body);
 if(target.duration==null||target.duration<0.2)throw Error('This video has no duration to sample');
 const file=await workspace.getFile(target.asset),points=[.2,.45,.7].map(part=>Math.min(target.duration-0.05,Math.max(0,target.duration*part)));
 const samples=[];
 for(const seconds of points){const image=await still(file.bytes,seconds);samples.push({seconds,image,mean:image.mean,r:image.r,g:image.g,b:image.b});}
 const chosen=chooseFrame(samples),match=samples.find(sample=>sample.seconds===chosen.seconds)||samples[0];
 return {...await storePair(workspace,match.image,'suggested',match.seconds),key:target.key};
}
export async function storeUploadedThumbnail(workspace,body){
 const {state}=await workspace.snapshot(),target=resolveLibraryTarget(state,body);
 if(typeof body.base64!=='string'||!/^[A-Za-z0-9+/=]+$/.test(body.base64)||body.base64.length>12e6)throw Error('Choose a JPG, PNG or WebP thumbnail');
 const bytes=Buffer.from(body.base64,'base64');
 const meta=await sharp(bytes,{limitInputPixels:24000000}).metadata();
 if(!['jpeg','png','webp'].includes(meta.format)||!meta.width||!meta.height)throw Error('Choose a JPG, PNG or WebP thumbnail');
 const original=await sharp(bytes).rotate().jpeg({quality:90}).toBuffer();
 const list=await sharp(original).resize({width:640,withoutEnlargement:true}).webp({quality:80}).toBuffer();
 const sized=await sharp(original).metadata();
 return {...await storePair(workspace,{original,list,width:sized.width,height:sized.height},'upload',null),key:target.key};
}
