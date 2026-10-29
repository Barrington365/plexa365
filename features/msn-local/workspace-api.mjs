import {expireWorkspaceJobs} from './workspace-job-expiry.mjs';
import {publication} from './publishing.mjs';
import {socialDraft} from './social-draft.mjs';
import {workspaceClips} from './workspace-render.mjs';
import {parseBuffer} from 'music-metadata';
import {workspaceArticle} from './workspace-articles.mjs';
import {validateKit} from '../brand-kits/store.mjs';
import {workspaceImage} from './workspace-images.mjs';
import {assignLayerAsset} from './assign-layer.mjs';
import path from 'node:path';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';import sharp from 'sharp';
import {removeBackground} from './background-removal.mjs';
const mediaURL=asset=>'/api/studio-workspace/media?asset='+encodeURIComponent(asset);
const mime=asset=>({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',mp4:'video/mp4',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',flac:'audio/flac',ogg:'audio/ogg'}[asset.split('.').at(-1)?.toLowerCase()]);
export async function workspaceRead(workspace,route){
 if(route==='state')await expireWorkspaceJobs(workspace);
 const {state}=await workspace.snapshot();
 switch(route){
  case 'images':return state.images;
  case 'studio-assets':return {assets:Object.values(state.assets).filter(f=>mime(f.asset)).map(f=>({asset:f.asset,name:f.name||path.basename(f.asset),type:mime(f.asset).split('/')[0],url:mediaURL(f.asset),updatedAt:f.updatedAt||state.images.find(i=>'images/'+i.id+'.png'===f.asset)?.updatedAt||null}))};
  case 'state':return {jobs:state.jobs,active:state.jobs.find(j=>['queued','running','saving'].includes(j.status))?.id,assets:workspaceClips(state).map(c=>({...c,url:mediaURL(c.asset)}))};
  case 'library-trash':return state.trash;
  case 'article-inbox':return {...(state.inbox||{articles:[],history:[],lastSuccessfulImportAt:null}),articles:(state.inbox?.articles||[]).map(a=>({...a,images:state.images.filter(i=>i.sourceUrl===a.sourceUrl).map(i=>({...i,url:mediaURL('images/'+i.id+'.png')}))}))};
  case 'studio-articles':return {articles:(state.inbox?.articles||[]).map(a=>({id:a.id,title:a.title,sourceUrl:a.sourceUrl,script:a.text,updatedAt:a.updatedAt,sourceCheckedAt:a.sourceCheckedAt||null,hasNarration:false}))};
  case 'brand-kits':return state.kits||JSON.parse(await fs.readFile(path.join(process.cwd(),'features/brand-kits/seeds.json'),'utf8'));
  default:throw Error('Studio route not found');
 }
}
export async function workspaceWrite(workspace,route,body){
 const projects=workspace.projects;
 if(body.file){if(!['images/import','studio-assets/upload','article/audio'].includes(route)||!Array.isArray(body.file.chunks)||body.file.chunks.length>14||!Number.isSafeInteger(body.file.bytes)||body.file.bytes<1||body.file.bytes>14e6)throw Error('Invalid uploaded file');body={...body,base64:(await workspace.readFile(body.file)).toString('base64')};delete body.file;}

 if(route.startsWith('article-inbox/'))return workspaceArticle(workspace,route.split('/').at(-1),body);
 switch(route){
  case 'studio-assets/upload':{
   const ext=path.extname(String(body.name)).toLowerCase(),type=mime(ext);if(!type||typeof body.base64!=='string'||body.base64.length>18e6||!/^[A-Za-z0-9+/=]+$/.test(body.base64))throw Error('Choose a supported image, audio or MP4 under 13 MB');const bytes=Buffer.from(body.base64,'base64');if(bytes.length>13e6)throw Error('Choose a file under 13 MB');
   if(type.startsWith('image/'))await sharp(bytes,{limitInputPixels:24000000}).metadata();else{const metadata=await parseBuffer(bytes,{mimeType:type},{duration:true});if(!Number.isFinite(metadata.format.duration)||metadata.format.duration<=0)throw Error('The uploaded media has no readable duration');}
   const asset='uploads/'+randomUUID()+ext,updatedAt=new Date().toISOString(),name=String(body.name).slice(0,150),entry=await workspace.putBytes(asset,bytes,{name,updatedAt});await workspace.update(s=>{s.assets[asset]=entry;return true;});return {asset,name,type:type.split('/')[0],url:mediaURL(asset),updatedAt};
  }
  case 'images/import':return workspaceImage(workspace,'import',body);
  case 'images/preview':return workspaceImage(workspace,'preview',body);
  case 'images/edit':{const result=await workspaceImage(workspace,'edit',body);if(body.projectId){try{return {...result,project:await assignLayerAsset(projects,{...body,asset:result.asset})};}catch(e){return {...result,error:e.message+' The edited image is saved in the Library.'};}}return result;}
  case 'projects/assign-layer':return assignLayerAsset(projects,body);
  case 'cancel':return workspace.update(s=>{const j=s.jobs.find(j=>j.id===body.id);if(!j)throw Error('Build not found');j.cancelRequestedAt=new Date().toISOString();if(j.status==='queued')j.status='cancelled';return {ok:true};});
  case 'brand-kits':{const kits=await workspaceRead(workspace,'brand-kits');const previous=kits.find(k=>k.id===body.id);const kit={...validateKit(body,previous),updatedAt:new Date().toISOString()};return workspace.update(s=>{const current=(s.kits||kits).find(k=>k.id===body.id);if(JSON.stringify(current)!==JSON.stringify(previous))throw Error('Another editor saved changes. Reload brand kits.');s.kits=(s.kits||kits).map(k=>k.id===kit.id?kit:k);return kit;});}
  case 'projects/from-article':{const result=await workspaceArticle(workspace,'project',{id:body.articleId,templateId:body.templateId});return projects.get(result.projectId);}
  case 'projects/social':return projects.create('news-article',socialDraft(body));
  case 'publish':case 'unpublish':return workspace.update(state=>{const job=state.jobs.find(j=>j.id===body.id);const next=publication(job,body,route==='publish');job.publication={...next,scope:'authenticated-studio'};return job;});
  case 'projects/create':return projects.create(body.templateId,{title:body.title||'Untitled video'});
  case 'projects/save':{const {id,templateId,createdAt,updatedAt,trashedAt,...patch}=body;if(typeof updatedAt!=='string')throw Error('Reload the saved revision before editing');return projects.save(id,patch,updatedAt);}
  case 'projects/trash':return projects.trash(body.id);
  case 'projects/restore':return projects.restore(body.id);
  case 'templates/save':return projects.saveTemplate(body);
  case 'library-trash':{if(typeof body.key!=='string'||body.key.length>2048||typeof body.trashed!=='boolean'||['__proto__','constructor','prototype'].includes(body.key))throw Error('Invalid trash request');return workspace.update(s=>{s.trash[body.key]={trashed:body.trashed,updatedAt:new Date().toISOString()};return s.trash;});}
  case 'images/remove-background':{
   const {state}=await workspace.snapshot(),original=state.images.find(i=>i.id===body.id);if(!original)throw Error('Image not found');
   let bytes=(await workspace.getFile('images/'+original.id+'.png')).bytes;
   if(body.crop){const {left,top,width,height}=body.crop;if(![left,top,width,height].every(Number.isInteger)||left<0||top<0||width<20||height<20||left+width>original.width||top+height>original.height)throw Error('Crop must fit inside the original image');bytes=await sharp(bytes).extract({left,top,width,height}).png().toBuffer();}
   const output=await removeBackground(bytes),meta=await sharp(output).metadata(),id=randomUUID(),updatedAt=new Date().toISOString();
   const asset={id,name:original.name.replace(/\.[^.]+$/,'')+' · cutout',kind:'cutout',parentId:original.id,sourceUrl:original.sourceUrl,method:'U²-Net · Studio foreground mask',width:meta.width,height:meta.height,updatedAt,...(body.crop?{crop:body.crop}:{})};
   const entry=await workspace.putBytes('images/'+id+'.png',output,{name:asset.name,updatedAt});
   await workspace.update(s=>{if(!s.images.some(i=>i.id===original.id))throw Error('Original is no longer available');s.assets[entry.asset]=entry;s.images.push(asset);return true;});return asset;
  }
  default:throw Error('Studio action is not connected yet');
 }
}
