/** Platform-independent CPU foreground segmentation. No paid API or remote image upload. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const MODEL_SHA256='309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8';
const SIDE=320, PIXELS=SIDE*SIDE;
let loaded;
async function runtime(){
 if(!loaded)loaded=(async()=>{
  const ort=await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads=1;
  const model=await fs.readFile(path.join(process.cwd(),'features/msn-local/models/u2netp.onnx'));
  if(createHash('sha256').update(model).digest('hex')!==MODEL_SHA256)throw Error('Background-removal model failed integrity check');
  const session=await ort.InferenceSession.create(model,{executionProviders:['wasm']});
  return {ort,session};
 })().catch(e=>{loaded=undefined;throw e;});
 return loaded;
}
export function normaliseMask(values){
 if(values.length!==PIXELS)throw Error('Invalid foreground mask dimensions');
 let min=Infinity,max=-Infinity;
 for(const value of values){if(!Number.isFinite(value))throw Error('Invalid foreground mask');min=Math.min(min,value);max=Math.max(max,value);}
 if(max-min<1e-6)throw Error('No foreground subject found. Try cropping closer to the player.');
 return Buffer.from(Uint8Array.from(values, value=>Math.round(255*(value-min)/(max-min))));
}
export async function removeBackground(bytes){
 if(bytes.length>14e6)throw Error('Choose an image under 14 MB');
 const source=await sharp(bytes,{limitInputPixels:24000000}).rotate().ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width,height}=source.info;
 const rgb=await sharp(source.data,{raw:source.info}).removeAlpha().resize(SIDE,SIDE,{fit:'fill'}).raw().toBuffer();
 let max=1;for(const value of rgb)max=Math.max(max,value);
 const tensor=new Float32Array(PIXELS*3),mean=[.485,.456,.406],std=[.229,.224,.225];
 for(let i=0;i<PIXELS;i++)for(let c=0;c<3;c++)tensor[c*PIXELS+i]=(rgb[i*3+c]/max-mean[c])/std[c];
 const {ort,session}=await runtime();
 const results=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',tensor,[1,3,SIDE,SIDE])});
 const mask=normaliseMask(results[session.outputNames[0]].data);
 return applyForegroundMask(source,mask);
}
export async function applyForegroundMask(source,mask){
 const {width,height}=source.info;
 const alpha=await sharp(mask,{raw:{width:SIDE,height:SIDE,channels:1}}).resize(width,height,{fit:'fill'}).greyscale().raw().toBuffer();
 let foreground=0,background=0;
 for(let i=0;i<width*height;i++){
  const opacity=Math.round(source.data[i*4+3]*alpha[i]/255);
  source.data[i*4+3]=opacity;
  if(alpha[i]>200&&opacity>0)foreground++;if(alpha[i]<20)background++;
 }
 if(foreground<width*height*.001||background<width*height*.001)throw Error('No usable foreground found. Try cropping closer to the player.');
 return sharp(source.data,{raw:source.info}).png().toBuffer();
}
