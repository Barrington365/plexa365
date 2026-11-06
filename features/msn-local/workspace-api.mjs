import {workspaceBroadcast} from './workspace-broadcast.mjs';
import {TEAMTALK_LIVE_AUTOMATION, appendTeamtalkLesson, runTeamtalkAutomation} from './teamtalk-live.mjs';
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
import {addStudioVideo,analyticsForVideos,applyPlayerPoster,approveThumbnail,assignThumbnail,createStudioPlaylist,deleteStudioPlaylist,libraryDetails,moveStudioVideo,removeStudioVideo,renameStudioPlaylist,resolveLibraryTarget,restoreThumbnail,videoLibraryView} from './video-library.mjs';
import {captureVideoFrame,storeUploadedThumbnail,suggestVideoFrame} from './video-thumbnail.mjs';
import {labelLibraryAsset,presenterCatalogue,savePresenterProfile} from './library-sections.mjs';
import {brandPlayerLinks} from './video-mrss.mjs';
const mediaURL=asset=>'/api/studio-workspace/media?asset='+encodeURIComponent(asset);
function playlistCatalogue(state){const view=videoLibraryView(state);const thumb=video=>video.thumbnail?.url||'';return {playlists:view.playlists,videos:view.videos.map(video=>({...video,thumbnail:thumb(view.finished.find(item=>item.jobId===video.jobId)||{})})),studioPlaylists:view.studioPlaylists,finished:view.finished.map(video=>({jobId:video.jobId,title:video.title,thumbnail:thumb(video)}))};}
function storeThumbnailDraft(state,captured){state.thumbnailDrafts??={};state.thumbnailDrafts[captured.key]=captured.draft;for(const entry of captured.entries)state.assets[entry.asset]=entry;return {key:captured.key,draft:captured.draft,url:mediaURL(captured.draft.listAsset),originalUrl:mediaURL(captured.draft.asset)};}
function playlistById(state,id){if(typeof id!=='string'||!id)throw Error('Choose a playlist');const playlist=state.playerPlaylists?.find(p=>p.id===id);if(!playlist)throw Error('Choose a playlist');playlist.videoIds??=[];return playlist;}
const mime=asset=>({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',flac:'audio/flac',ogg:'audio/ogg'}[asset.split('.').at(-1)?.toLowerCase()]);
export function studioArticlesFrom(articles){return {articles:(articles||[]).map(a=>({id:a.id,title:a.title,brand:typeof a.brand==='string'?a.brand:'',sourceUrl:a.sourceUrl,script:a.spokenDraft?.status==='ready'&&a.spokenDraft.sourceFingerprint===a.fingerprint?a.spokenDraft.script:a.text,updatedAt:a.updatedAt||null,sourceCheckedAt:a.sourceCheckedAt||null,hasNarration:false}))};}
export async function workspaceRead(workspace,route){
 if(['state','article-inbox'].includes(route))await expireWorkspaceJobs(workspace);
 const {state}=await workspace.snapshot();
 switch(route){
  case 'images':return state.images;
  case 'studio-assets':return {assets:Object.values(state.assets).filter(f=>mime(f.asset)).map(f=>{const category=['presenter','studio','intro','outro','transition','background','graphics'].includes(f.category)?f.category:undefined;return {asset:f.asset,name:f.name||path.basename(f.asset),type:mime(f.asset).split('/')[0],url:mediaURL(f.asset),updatedAt:f.updatedAt||state.images.find(i=>'images/'+i.id+'.png'===f.asset)?.updatedAt||null,...(f.librarySection?{librarySection:f.librarySection}:{}),...(category?{category}:{})};})};
  case 'state':return {jobs:state.jobs,active:state.jobs.find(j=>['queued','running','saving'].includes(j.status))?.id,assets:workspaceClips(state).map(c=>({...c,url:mediaURL(c.asset)}))};
  case 'library-trash':return state.trash;
  case 'playlists':return playlistCatalogue(state);
  case 'video-library':{const view=videoLibraryView(state);return {...view,playerMenu:brandPlayerLinks(view)};}
  case 'article-inbox':return {...(state.inbox||{articles:[],history:[],lastSuccessfulImportAt:null}),articles:(state.inbox?.articles||[]).map(a=>({...a,scriptPreparation:(()=>{const j=state.jobs.find(j=>j.id===a.scriptPreparation?.jobId);return j?.status==='failed'?{...a.scriptPreparation,status:'failed',error:j.stage,updatedAt:j.updatedAt}:a.scriptPreparation;})(),images:state.images.filter(i=>i.sourceUrl===a.sourceUrl).map(i=>({...i,url:mediaURL('images/'+i.id+'.png')}))}))};
  case 'studio-articles':return studioArticlesFrom(state.inbox?.articles);
  case 'brand-kits':return state.kits||JSON.parse(await fs.readFile(path.join(process.cwd(),'features/brand-kits/seeds.json'),'utf8'));
  case 'automations':return {automations:[TEAMTALK_LIVE_AUTOMATION],lessons:state.teamtalkLessons||[],baseline:null};
  case 'presenters':return {presenters:presenterCatalogue(state)};
  default:throw Error('Studio route not found');
 }
}
export async function workspaceWrite(workspace,route,body){
 const projects=workspace.projects;
 if(body.file){if(!['images/import','studio-assets/upload','article/audio'].includes(route)||!Array.isArray(body.file.chunks)||body.file.chunks.length>14||!Number.isSafeInteger(body.file.bytes)||body.file.bytes<1||body.file.bytes>14e6)throw Error('Invalid uploaded file');body={...body,base64:(await workspace.readFile(body.file)).toString('base64')};delete body.file;}

 if(route.startsWith('broadcast/'))return workspaceBroadcast(workspace,route.split('/').at(-1),body);
 if(route.startsWith('article-inbox/'))return workspaceArticle(workspace,route.split('/').at(-1),body);
 switch(route){
  case 'studio-assets/upload':{
   const ext=path.extname(String(body.name)).toLowerCase(),type=mime(ext);if(!type||typeof body.base64!=='string'||body.base64.length>18e6||!/^[A-Za-z0-9+/=]+$/.test(body.base64))throw Error('Choose a supported image, audio or MP4 under 13 MB');const bytes=Buffer.from(body.base64,'base64');if(bytes.length>13e6)throw Error('Choose a file under 13 MB');
   if(type.startsWith('image/'))await sharp(bytes,{limitInputPixels:24000000}).metadata();else{const metadata=await parseBuffer(bytes,{mimeType:type},{duration:true});if(!Number.isFinite(metadata.format.duration)||metadata.format.duration<=0)throw Error('The uploaded media has no readable duration');}
   const category=['presenter','studio','intro','outro','transition','background','graphics'].includes(body.category)?body.category:undefined,asset='uploads/'+randomUUID()+ext,updatedAt=new Date().toISOString(),name=String(body.name).slice(0,150),entry=await workspace.putBytes(asset,bytes,{name,updatedAt,...(category?{category}:{})});await workspace.update(s=>{s.assets[asset]=entry;return true;});return {asset,name,type:type.split('/')[0],url:mediaURL(asset),updatedAt,...(category?{category}:{})};
  }
  case 'images/import':return workspaceImage(workspace,'import',body);
  case 'images/preview':return workspaceImage(workspace,'preview',body);
  case 'images/edit':{const result=await workspaceImage(workspace,'edit',body);if(body.projectId){try{return {...result,project:await assignLayerAsset(projects,{...body,asset:result.asset})};}catch(e){return {...result,error:e.message+' The edited image is saved in the Library.'};}}return result;}
  case 'projects/assign-layer':return assignLayerAsset(projects,body);
  case 'pause':return workspace.update(s=>{const j=s.jobs.find(j=>j.id===body.id);if(!j)throw Error('Build not found');if(!['queued','running','saving'].includes(j.status))throw Error('This build is not running');j.pauseRequestedAt=new Date().toISOString();if(j.status==='queued'){j.status='paused';delete j.startedAt;j.stage='Paused. Completed scenes are saved.';j.updatedAt=j.pauseRequestedAt;}return {ok:true};});
  case 'cancel':return workspace.update(s=>{const j=s.jobs.find(j=>j.id===body.id);if(!j)throw Error('Build not found');j.cancelRequestedAt=new Date().toISOString();if(['queued','paused'].includes(j.status)){j.status='cancelled';j.stage='Cancelled. Completed scenes are saved.';}return {ok:true};});
  case 'brand-kits':{const kits=await workspaceRead(workspace,'brand-kits');const previous=kits.find(k=>k.id===body.id);const kit={...validateKit(body,previous),updatedAt:new Date().toISOString()};return workspace.update(s=>{const current=(s.kits||kits).find(k=>k.id===body.id);if(JSON.stringify(current)!==JSON.stringify(previous))throw Error('Another editor saved changes. Reload brand kits.');s.kits=(s.kits||kits).map(k=>k.id===kit.id?kit:k);return kit;});}
  case 'projects/from-article':{if(body.templateId==='football365-live-studio-broadcast')return workspaceBroadcast(workspace,'create',{articleIds:[body.articleId]});const result=await workspaceArticle(workspace,'project',{id:body.articleId,templateId:body.templateId});return projects.get(result.projectId);}
  case 'projects/social':return projects.create('news-article',socialDraft(body));
  case 'publish':case 'unpublish':return workspace.update(state=>{const job=state.jobs.find(j=>j.id===body.id);const next=publication(job,body,route==='publish');job.publication={...next,scope:'authenticated-studio'};return job;});
  case 'projects/create':return projects.create(body.templateId,{title:body.title||'Untitled video'});
  case 'projects/save':{const {id,templateId,createdAt,updatedAt,trashedAt,...patch}=body;if(typeof updatedAt!=='string')throw Error('Reload the saved revision before editing');return projects.save(id,patch,updatedAt);}
  case 'projects/trash':return projects.trash(body.id);
  case 'projects/restore':return projects.restore(body.id);
  case 'templates/save':return projects.saveTemplate(body);
  case 'library-trash':{if(typeof body.key!=='string'||body.key.length>2048||typeof body.trashed!=='boolean'||['__proto__','constructor','prototype'].includes(body.key))throw Error('Invalid trash request');return workspace.update(s=>{s.trash[body.key]={trashed:body.trashed,updatedAt:new Date().toISOString()};return s.trash;});}
  case 'library/label':return workspace.update(s=>labelLibraryAsset(s,body));
  case 'presenters/save':return workspace.update(s=>savePresenterProfile(s,body));
  case 'playlists/add':return workspace.update(s=>{const playlist=playlistById(s,body.playlistId);const video=(s.websiteVideos||[]).find(v=>v.jobId===body.jobId&&v.destinationId===playlist.destinationId&&v.status==='published');if(!video)throw Error('Publish this video to the player before adding it to a playlist');if(!playlist.videoIds.includes(video.id))playlist.videoIds.push(video.id);return playlistCatalogue(s);});
  case 'playlists/remove':return workspace.update(s=>{const playlist=playlistById(s,body.playlistId);if(typeof body.videoId!=='string')throw Error('Choose a video');playlist.videoIds=playlist.videoIds.filter(id=>id!==body.videoId);return playlistCatalogue(s);});
  case 'playlists/move':return workspace.update(s=>{const playlist=playlistById(s,body.playlistId);if(typeof body.videoId!=='string'||!['up','down'].includes(body.direction))throw Error('Choose a video');const index=playlist.videoIds.indexOf(body.videoId),next=index+(body.direction==='up'?-1:1);if(index<0||next<0||next>=playlist.videoIds.length)throw Error('That video cannot move further');const [item]=playlist.videoIds.splice(index,1);playlist.videoIds.splice(next,0,item);return playlistCatalogue(s);});
  case 'thumbnails/capture':{const captured=await captureVideoFrame(workspace,body);return workspace.update(s=>storeThumbnailDraft(s,captured));}
  case 'thumbnails/suggest':{const captured=await suggestVideoFrame(workspace,body);return workspace.update(s=>storeThumbnailDraft(s,captured));}
  case 'thumbnails/ensure':{const {state}=await workspace.snapshot(),target=resolveLibraryTarget(state,body);const existing=state.thumbnails?.[target.key];if(existing?.listAsset)return {key:target.key,skipped:true,url:mediaURL(existing.listAsset),originalUrl:mediaURL(existing.asset),updatedAt:existing.updatedAt||null};const captured=await suggestVideoFrame(workspace,body);return workspace.update(s=>{const saved=assignThumbnail(s,captured,new Date().toISOString());if(saved.skipped){const kept=s.thumbnails?.[saved.key];return {...saved,url:kept?.listAsset?mediaURL(kept.listAsset):null,originalUrl:kept?.asset?mediaURL(kept.asset):null,updatedAt:kept?.updatedAt||null};}return {...saved,url:mediaURL(saved.asset),originalUrl:mediaURL(captured.draft.asset)};});}
  case 'thumbnails/upload':{const captured=await storeUploadedThumbnail(workspace,body);return workspace.update(s=>storeThumbnailDraft(s,captured));}
  case 'thumbnails/save':return workspace.update(s=>{const target=resolveLibraryTarget(s,body),now=new Date().toISOString();s.thumbnails??={};s.thumbnails[target.key]=approveThumbnail(s.thumbnails[target.key],s.thumbnailDrafts?.[target.key],now);if(s.thumbnailDrafts)delete s.thumbnailDrafts[target.key];const player=body.applyToPlayer===true&&target.job?applyPlayerPoster(s,target.job.id,s.thumbnails[target.key],body.destinationId):null;return {thumbnail:s.thumbnails[target.key],player};});
  case 'thumbnails/restore':return workspace.update(s=>{const target=resolveLibraryTarget(s,body);s.thumbnails??={};s.thumbnails[target.key]=restoreThumbnail(s.thumbnails[target.key],new Date().toISOString());return {thumbnail:s.thumbnails[target.key]};});
  case 'videos/details':return workspace.update(s=>{const target=resolveLibraryTarget(s,body),details={...libraryDetails(body),updatedAt:new Date().toISOString()};s.videoDetails??={};s.videoDetails[target.key]=details;return details;});
  case 'videos/analytics':{const {state}=await workspace.snapshot(),target=resolveLibraryTarget(state,body),ids=target.job?(state.websiteVideos||[]).filter(video=>video.jobId===target.job.id).map(video=>video.id):[];return analyticsForVideos(state.playerEvents,ids);}
  case 'studio-playlists/create':return workspace.update(s=>{createStudioPlaylist(s,body,randomUUID(),new Date().toISOString());return playlistCatalogue(s);});
  case 'studio-playlists/add':return workspace.update(s=>(addStudioVideo(s,body.playlistId,body.jobId,new Date().toISOString()),playlistCatalogue(s)));
  case 'studio-playlists/remove':return workspace.update(s=>(removeStudioVideo(s,body.playlistId,body.jobId,new Date().toISOString()),playlistCatalogue(s)));
  case 'studio-playlists/move':return workspace.update(s=>(moveStudioVideo(s,body.playlistId,body.jobId,body.direction,new Date().toISOString()),playlistCatalogue(s)));
  case 'studio-playlists/rename':return workspace.update(s=>(renameStudioPlaylist(s,{...body,playlistId:body.playlistId},new Date().toISOString()),playlistCatalogue(s)));
  case 'studio-playlists/delete':return workspace.update(s=>(deleteStudioPlaylist(s,body.playlistId),playlistCatalogue(s)));
  case 'automations/run':return runTeamtalkAutomation();
  case 'automations/lesson':return workspace.update(s=>appendTeamtalkLesson(s,body));
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
