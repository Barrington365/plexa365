/** Library metadata, thumbnails and internal playlists for completed Studio videos. */
const mediaURL=asset=>'/api/studio-workspace/media?asset='+encodeURIComponent(asset);
const text=(value,max,label)=>{const out=String(value??'').trim();if(out.length>max)throw Error(label+' is too long');return out;};
export function videoKey(asset,jobId){return asset?'file:'+asset:'job:'+jobId;}
export function chooseFrame(samples){
 if(!Array.isArray(samples)||!samples.length)throw Error('No frames to compare');
 const usable=samples.filter(sample=>Number.isFinite(sample.mean)&&sample.mean>=18&&!(sample.g>sample.r*1.35&&sample.g>sample.b*1.35&&sample.g>50));
 const pool=usable.length?usable:samples;
 return pool.reduce((best,sample)=>sample.mean>best.mean?sample:best);
}
export function libraryDetails(input){
 const title=text(input.title,150,'Title');if(!title)throw Error('Enter a title');
 const description=text(input.description,2000,'Description');
 const tags=Array.isArray(input.tags)?[...new Set(input.tags.map(tag=>text(tag,40,'A tag')))].filter(Boolean).slice(0,30):[];
 const category=text(input.category,80,'Category'),sport=text(input.sport,80,'Sport'),language=text(input.language,16,'Language')||'en';
 if(!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(language))throw Error('Use a language code such as en');
 const visibility=['workspace','public'].includes(input.visibility)?input.visibility:'workspace';
 return {title,description,tags,category,sport,language,visibility};
}
export function approveThumbnail(current,draft,updatedAt){
 if(!draft?.asset||!draft.listAsset)throw Error('Capture a frame first');
 const previous=current?.asset?{asset:current.asset,listAsset:current.listAsset,seconds:current.seconds??null,source:current.source||'capture',updatedAt:current.updatedAt}:null;
 return {...draft,previous,updatedAt};
}
export function assignThumbnail(state,captured,updatedAt){
 if(!captured?.key||!captured.draft?.asset)throw Error('Capture a frame first');
 state.thumbnails??={};
 if(state.thumbnails[captured.key]?.listAsset)return {key:captured.key,skipped:true};
 state.assets??={};
 for(const entry of captured.entries||[])state.assets[entry.asset]=entry;
 state.thumbnails[captured.key]=approveThumbnail(state.thumbnails[captured.key],captured.draft,updatedAt);
 return {key:captured.key,skipped:false,updatedAt,asset:captured.draft.listAsset};
}
export function restoreThumbnail(current,updatedAt){
 if(!current?.previous?.asset)throw Error('There is no previous thumbnail');
 const previous={asset:current.asset,listAsset:current.listAsset,seconds:current.seconds??null,source:current.source||'capture',updatedAt:current.updatedAt};
 return {...current.previous,previous,updatedAt};
}
export function applyPlayerPoster(state,jobId,thumbnail,destinationId){
 const videos=(state.websiteVideos||[]).filter(video=>video.jobId===jobId&&video.status==='published');
 if(!videos.length)throw Error('This video is not on the public player');
 const video=videos.length===1?videos[0]:videos.find(item=>item.destinationId===destinationId);
 if(!video)throw Error('Choose which player destination should use this thumbnail');
 const entry=state.assets?.[thumbnail.asset];
 if(!entry?.sha256||!/\.(png|jpe?g|webp)$/i.test(thumbnail.asset))throw Error('Captured thumbnail is missing');
 video.posterAsset=thumbnail.asset;video.posterHash=entry.sha256;video.updatedAt=thumbnail.updatedAt;
 return {id:video.id,destinationId:video.destinationId,updatedAt:video.updatedAt};
}
function playlistTitle(input){const title=text(input.title,150,'Playlist title');if(!title)throw Error('Enter a playlist title');return title;}
export function createStudioPlaylist(state,input,id,updatedAt){
 const title=playlistTitle(input),description=text(input.description,500,'Description'),brand=text(input.brand,80,'Brand');
 state.studioPlaylists??=[];
 if(state.studioPlaylists.some(playlist=>playlist.title.toLowerCase()===title.toLowerCase()&&(playlist.brand||'')===brand))throw Error('A playlist with that title already exists');
 const playlist={id,title,description,brand,visibility:'workspace',jobIds:[],updatedAt};
 state.studioPlaylists.push(playlist);return playlist;
}
function studioPlaylist(state,id){const playlist=state.studioPlaylists?.find(item=>item.id===id);if(!playlist)throw Error('Choose a playlist');playlist.jobIds??=[];return playlist;}
function completedJob(state,jobId){const job=state.jobs?.find(item=>item.id===jobId&&item.status==='complete'&&item.output?.asset);if(!job)throw Error('Choose a completed video');return job;}
export function addStudioVideo(state,playlistId,jobId,updatedAt){const playlist=studioPlaylist(state,playlistId);completedJob(state,jobId);if(playlist.jobIds.includes(jobId))throw Error('That video is already in this playlist');playlist.jobIds.push(jobId);playlist.updatedAt=updatedAt;return playlist;}
export function removeStudioVideo(state,playlistId,jobId,updatedAt){const playlist=studioPlaylist(state,playlistId);playlist.jobIds=playlist.jobIds.filter(id=>id!==jobId);playlist.updatedAt=updatedAt;return playlist;}
export function moveStudioVideo(state,playlistId,jobId,direction,updatedAt){
 const playlist=studioPlaylist(state,playlistId);if(!['up','down'].includes(direction))throw Error('Choose a video');
 const index=playlist.jobIds.indexOf(jobId),next=index+(direction==='up'?-1:1);
 if(index<0||next<0||next>=playlist.jobIds.length)throw Error('That video cannot move further');
 const [item]=playlist.jobIds.splice(index,1);playlist.jobIds.splice(next,0,item);playlist.updatedAt=updatedAt;return playlist;
}
export function renameStudioPlaylist(state,input,updatedAt){const playlist=studioPlaylist(state,input.playlistId);playlist.title=playlistTitle(input);playlist.description=text(input.description,500,'Description');playlist.brand=text(input.brand,80,'Brand');playlist.updatedAt=updatedAt;return playlist;}
export function deleteStudioPlaylist(state,playlistId){const before=state.studioPlaylists?.length||0;state.studioPlaylists=(state.studioPlaylists||[]).filter(playlist=>playlist.id!==playlistId);if(state.studioPlaylists.length===before)throw Error('Choose a playlist');return true;}
export function analyticsForVideos(events,videoIds){
 const mine=(events||[]).filter(event=>videoIds.includes(event.videoId)&&typeof event.event==='string');
 if(!videoIds.length)return {available:false,loads:null,starts:null,completions:null,completionRate:null,averageWatchTime:null,playbackErrors:null,adImpressions:null};
 const count=name=>mine.filter(event=>event.event===name).length,starts=count('start'),completions=count('complete');
 return {available:true,loads:count('load'),starts,completions,completionRate:starts?Math.round(completions/starts*1000)/10:null,averageWatchTime:null,playbackErrors:null,adImpressions:mine.some(event=>event.event==='ad-impression')?count('ad-impression'):null};
}
function httpsUrl(value){return typeof value==='string'&&/^https:\/\//.test(value)?value:'';}
function sourceReferences(job,videos){
 const found=[];const add=(url,title,publisher)=>{const clean=httpsUrl(url);if(!clean||found.some(item=>item.url===clean))return;found.push({url:clean,title:typeof title==='string'?title:'',publisher:typeof publisher==='string'?publisher:''});};
 for(const video of videos)for(const article of video.articles||[])add(article.canonicalUrl,article.title,article.publisher);
 const project=job.request?.project;add(project?.sourceUrl,project?.title,'');add(project?.metadata?.sourceUrl,project?.title,'');
 for(const story of project?.broadcast?.stories||[])add(story.sourceUrl,story.title,story.author);
 return found;
}
function thumbView(record){return record?.listAsset?{url:mediaURL(record.listAsset),originalUrl:mediaURL(record.asset),seconds:record.seconds??null,width:record.width||null,height:record.height||null,updatedAt:record.updatedAt||null,source:record.source||'capture',hasPrevious:Boolean(record.previous?.asset)}:null;}
function destinationBrand(state,id){return state.playerDestinations?.find(destination=>destination.id===id)?.brand||'';}
export function videoLibraryView(state){
 const thumbnails=state.thumbnails||{},details=state.videoDetails||{};
 const finished=(state.jobs||[]).filter(job=>job.status==='complete'&&job.output?.url&&job.request?.projectId&&job.request?.kind==='studio').map(job=>{
  const key=videoKey(job.output.asset,job.id),library=details[key]||{},player=(state.websiteVideos||[]).filter(video=>video.jobId===job.id);
  const published=player.filter(video=>video.status==='published');
  return {key,jobId:job.id,projectId:job.request.projectId,asset:job.output.asset,title:library.title||job.output.title||job.request.project?.title||'Finished video',renderTitle:job.output.title||'',description:library.description||job.request.project?.metadata?.description||'',tags:library.tags||job.request.project?.metadata?.tags||[],category:library.category||published[0]?.category||'',sport:library.sport||'',language:library.language||job.request.project?.metadata?.language||'',visibility:library.visibility||'workspace',duration:Number.isFinite(job.output.duration)?job.output.duration:null,width:job.output.width||null,height:job.output.height||null,createdAt:job.createdAt||null,updatedAt:job.output.updatedAt||job.updatedAt||null,detailsUpdatedAt:library.updatedAt||null,thumbnail:thumbView(thumbnails[key]),brand:job.publication?.brand||destinationBrand(state,published[0]?.destinationId)||'',type:'Studio',renderStatus:job.status,studioPlayer:job.publication?.status||null,player:player.map(video=>({id:video.id,destinationId:video.destinationId,brand:destinationBrand(state,video.destinationId),status:video.status,publishedAt:video.publishedAt||null,title:video.title,youtube:video.youtube?.status||null})),articles:sourceReferences(job,player)};
 });
 const uploads=Object.values(state.assets||{}).filter(asset=>asset.asset&&/\.mp4$/i.test(asset.asset)&&!finished.some(video=>video.asset===asset.asset)).map(asset=>{const key=videoKey(asset.asset);const library=details[key]||{};return {key,asset:asset.asset,title:library.title||asset.name||'Uploaded video',description:library.description||'',tags:library.tags||[],category:library.category||'',sport:library.sport||'',language:library.language||'',visibility:library.visibility||'workspace',createdAt:null,updatedAt:asset.updatedAt||null,detailsUpdatedAt:library.updatedAt||null,thumbnail:thumbView(thumbnails[key]),type:'Upload',renderStatus:'uploaded',studioPlayer:null,player:[],articles:[],duration:null,brand:''};});
 const playlists=(state.playerPlaylists||[]).map(playlist=>({id:playlist.id,title:playlist.title,destinationId:playlist.destinationId,brand:destinationBrand(state,playlist.destinationId),videoIds:[...(playlist.videoIds||[])]}));
 const studioPlaylists=(state.studioPlaylists||[]).map(playlist=>({id:playlist.id,title:playlist.title,description:playlist.description||'',brand:playlist.brand||'',visibility:playlist.visibility||'workspace',jobIds:[...(playlist.jobIds||[])],updatedAt:playlist.updatedAt||null}));
 return {finished,uploads,playlists,studioPlaylists,videos:(state.websiteVideos||[]).filter(video=>video.status==='published').map(video=>({id:video.id,jobId:video.jobId,title:video.title,destinationId:video.destinationId}))};
}
export function resolveLibraryTarget(state,body){
 if(typeof body.jobId==='string'&&body.jobId){const job=state.jobs?.find(item=>item.id===body.jobId&&item.status==='complete'&&item.output?.asset);if(!job)throw Error('Choose a completed video');return {key:videoKey(job.output.asset,job.id),job,asset:job.output.asset,duration:Number.isFinite(job.output.duration)?job.output.duration:null};}
 if(typeof body.asset==='string'&&body.asset&&state.assets?.[body.asset]&&/\.mp4$/i.test(body.asset))return {key:videoKey(body.asset),job:null,asset:body.asset,duration:null};
 throw Error('Choose a completed video');
}
