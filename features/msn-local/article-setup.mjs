import fs from 'node:fs/promises';
import path from 'node:path';
export async function localArticles(root){
const p=JSON.parse(await fs.readFile(path.join(root,'projects/mac-allister/project.json'),'utf8'));
return [{id:'mac-allister',title:p.sourceArticleTitle||p.title,sourceUrl:p.sourceUrl,script:p.script,imageAsset:'projects/mac-allister/source.jpg',updatedAt:p.updatedAt,sourceCheckedAt:p.sourceCheckedAt,hasNarration:!!p.audio}];
}
export async function projectFromArticle(store,root,{articleId,templateId,title}){
if(articleId!=='mac-allister')throw Error('Select an imported local article');
const source=JSON.parse(await fs.readFile(path.join(root,'projects/mac-allister/project.json'),'utf8'));
const p=await store.create(templateId,{title:title||source.title});
const scene=p.scenes[0];scene.duration=57;
for(const l of scene.layers){
if(l.type==='image')l.asset=l.id==='brand-logo'?'projects/mac-allister/brand.png':l.id==='article-image'?'projects/mac-allister/source.jpg':l.id.includes('cutout')?'images/'+source.cutoutAssetId+'.png':'projects/mac-allister/logo.png';
if(l.id==='headline')l.text='ALEXIS\nMAC ALLISTER';if(l.id==='club-name')l.text='LIVERPOOL · FUTURE IN FOCUS';if(l.id==='summary')l.text='Reported options · no deal confirmed';if(l.id==='story-status')l.text='TRANSFER WATCH · REPORT';
if(l.id==='to-club-logo')Object.assign(l,{type:'text',asset:'',text:'?',fontSize:150,color:'#00e8f0'});
}
if(templateId==='news-article'){scene.layers.find(l=>l.id==='headline').text='MAC ALLISTER: FUTURE IN FOCUS';scene.layers.find(l=>l.id==='headline').y=710;scene.layers.find(l=>l.id==='summary').y=810;}
return store.save(p.id,{scenes:p.scenes,audio:{asset:'projects/mac-allister/'+source.audio,volume:1},voice:source.voice,srt:source.srt,burnCaptions:true,captionPreset:'bold',script:source.script,sourceUrl:source.sourceUrl,sourceCheckedAt:source.sourceCheckedAt,metadata:{description:'Imported article draft. Reported options; no transfer confirmed.',tags:['Football365','Liverpool','Mac Allister'],sourceUrl:source.sourceUrl,language:'en'}});
}
