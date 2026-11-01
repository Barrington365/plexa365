/** Capabilities describe reviewed layouts; never infer support from a template name. */
export const BROADCAST_ID='football365-live-studio-broadcast';
export function articleCapabilities(template){
 const broadcast=template.id===BROADCAST_ID;
 const branded=broadcast||template.defaults?.productionProfile==='football365-news-studio-v1';
 const known=['news-article','player-club','transfer',BROADCAST_ID].includes(template.id)||(template.defaults?.width===1920&&template.defaults?.height===1080&&template.defaults?.productionProfile!=='football365-live-broadcast-v1');
 return {modes:broadcast?['single','multiple']:['single'],min:1,max:broadcast?50:1,orientations:['landscape'],profiles:branded?['msn']:['standard'],brands:branded?['Football365']:[],available:known};
}
export function validateArticleBuild(template, articles, body={}){
 if(!template)throw Error('Choose an existing video template');
 const c=articleCapabilities(template);
 if(!c.available)throw Error('This template has not been reviewed for article creation');
 const mode=body.storyMode|| (articles.length>1?'multiple':'single');
 if(!c.modes.includes(mode)||articles.length<c.min||articles.length>c.max||mode==='multiple'&&articles.length<2)throw Error('Choose a compatible template and story count');
 if(!c.orientations.includes(body.orientation||'landscape'))throw Error('This template requires landscape');
 if(!c.profiles.includes(body.outputProfile||c.profiles[0]))throw Error('Choose a compatible output profile');
 if(articles.some(a=>!a))throw Error('A selected article is no longer available');
 if(new Set(articles.map(a=>a.id)).size!==articles.length||new Set(articles.map(a=>a.sourceUrl)).size!==articles.length)throw Error('Choose distinct source articles');
 if(c.brands.length&&articles.some(a=>!c.brands.includes(a.brand)))throw Error('This template requires Football365 articles');
 if(body.title!==undefined&&(typeof body.title!=='string'||!body.title.trim()||body.title.length>100))throw Error('Enter a project title of up to 100 characters');
 return c;
}
