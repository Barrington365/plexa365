import {broadcastSchema,broadcastScript,storyFromArticle} from './broadcast.mjs';
import {football365BroadcastDefaults} from './football365-profile.mjs';
export const BROADCAST_TEMPLATE='football365-live-studio-broadcast';
const frame=v=>Math.round(v*30)/30;
export function broadcastScenes(b,background){return b.stories.map(s=>({id:s.id,duration:frame(s.targetSeconds),background:'#07131f',video:{asset:background,start:0,loop:true},layers:[{id:s.id+'-crest',type:'logo',asset:s.leftAsset,x:91,y:353,width:365,height:262,fit:'contain',screenBackground:'#07131f',screenCorners:[[0,0],[1,.216],[1,.923],[0,1]]},{id:s.id+'-article',type:'image',asset:s.rightAssets[0]||'',x:1376,y:200,width:449,height:518,fit:'contain',screenBackground:'#07131f',screenCorners:[[0,.333],[1,0],[1,1],[0,.848]]}]}));}
export async function workspaceBroadcast(w,action,body){
 const {state}=await w.snapshot();
 if(action==='create'){
  const ids=body.articleIds;if(!Array.isArray(ids)||!ids.length||ids.length>50||new Set(ids).size!==ids.length)throw Error('Choose 1–50 distinct articles');
  const stories=ids.map(id=>{const a=state.inbox?.articles.find(a=>a.id===id);if(!a||a.brand!=='Football365')throw Error('Choose imported Football365 articles');const story=storyFromArticle(a);story.rightAssets=state.images.filter(i=>i.sourceUrl===a.sourceUrl&&i.kind==='original').map(i=>'images/'+i.id+'.png');const club=/arsenal/i.test(a.title)?'arsenal':/man utd|manchester united/i.test(a.title)?'manchester.?united|man.?utd':null;if(club){const crestName=club==='arsenal'?'arsenal-logo.png':'manchester-united-logo.png';const crest=Object.values(state.assets).find(v=>(v.name||'').toLowerCase()===crestName&&/\.(png|jpg|webp)$/i.test(v.asset));if(crest)story.leftAsset=crest.asset;}return story;});
  if(stories.some(s=>!s.script.trim()))throw Error('Wait for each spoken script to be prepared, then review it before creating the broadcast');
  const background=Object.values(state.assets).find(a=>a.name==='Football365-Female-Studio-Background-Compact.mp4')?.asset;
  if(!background)throw Error('Upload the approved Football365 Female Studio background first');
  const broadcast=broadcastSchema.parse({version:1,opening:'Welcome to Football365 LIVE.',closing:"That's your Football365 update.",stories});
  return w.projects.create(BROADCAST_TEMPLATE,{...football365BroadcastDefaults(),title:body.title||(stories.length===1?stories[0].title:'Football365 LIVE — '+stories.map(s=>s.title).join(' / ').slice(0,150)),broadcast,script:broadcastScript(broadcast),sourceUrl:stories[0].sourceUrl,scenes:broadcastScenes(broadcast,background),metadata:{description:'Editorial broadcast draft. Review each source, image rights and narration before delivery.',tags:[...new Set(['Football365','broadcast',...stories.flatMap(s=>s.title.match(/\b[A-Z][a-z]{3,}\b/g)||[])])].slice(0,50),sourceUrl:stories[0].sourceUrl,language:'en-GB'}});
 }
 if(action==='save'){
  const p=await w.projects.get(body.projectId);if(p.updatedAt!==body.expectedUpdatedAt)throw Error('Project changed. Reload the rundown before saving');
  const b=broadcastSchema.parse(body.broadcast),background=p.scenes[0]?.video?.asset;if(!background)throw Error('Choose the approved studio background');
  // Sources are snapshots, not arbitrary replacements supplied by the editor.
  for(const story of b.stories){if(!p.broadcast?.stories.some(s=>s.id===story.id)&&state.inbox?.articles.find(a=>a.id===story.articleId)?.brand!=='Football365')throw Error('Choose imported Football365 articles');const source=p.broadcast?.stories.find(s=>s.id===story.id)||storyFromArticle(state.inbox?.articles.find(a=>a.id===story.articleId)||{});for(const k of ['articleId','sourceUrl','title','sourceText','sourceRevision','sourceFingerprint','publishedAt','sourceUpdatedAt','author'])if(JSON.stringify(story[k])!==JSON.stringify(source[k]))throw Error('Source snapshots cannot be edited in the rundown; replace with a newly imported story');}
  for(const story of b.stories){const previous=p.broadcast?.stories.find(s=>s.id===story.id);if(!previous||JSON.stringify({...story,updatedAt:null})!==JSON.stringify({...previous,updatedAt:null}))story.updatedAt=new Date().toISOString();else story.updatedAt=previous.updatedAt;}
  return w.projects.save(p.id,{...(body.patch||{}),broadcast:b,script:broadcastScript(b),scenes:broadcastScenes(b,background).map(scene=>{const old=(body.patch?.scenes||p.scenes).find(v=>v.id===scene.id),before=p.broadcast?.stories.find(v=>v.id===scene.id),after=b.stories.find(v=>v.id===scene.id);return old?{...old,duration:before?.targetSeconds===after.targetSeconds?old.duration:scene.duration,layers:old.layers.map(layer=>layer.id===scene.id+'-crest'?{...layer,asset:after.leftAsset}:layer.id===scene.id+'-article'?{...layer,asset:after.rightAssets[0]||''}:layer)}:scene;})},p.updatedAt);
 }
 throw Error('Unknown broadcast action');
}
