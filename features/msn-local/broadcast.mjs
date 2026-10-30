/** Broadcast rundown is independent of source articles and approved single-story drafts. */
import {z} from 'zod';
const localAsset=z.string().max(4096).refine(v=>!v||(!/^[a-z]+:|^\/|\\|[\x00-\x1f]/i.test(v)&&!v.split('/').includes('..')),'Use a Library asset');
export const broadcastStorySchema=z.object({
 id:z.string().min(1).max(100),articleId:z.string().max(100),sourceUrl:z.string().url(),title:z.string().min(1).max(300),
 sourceText:z.string().min(20).max(100000),sourceRevision:z.number().int().min(1),sourceFingerprint:z.string().max(100),
 publishedAt:z.string().datetime().nullable(),sourceUpdatedAt:z.string().datetime().nullable(),author:z.string().max(500).default(''),
 script:z.string().max(10000),targetSeconds:z.number().min(1).max(1200).default(45),
 leftAsset:localAsset.default(''),rightAssets:z.array(localAsset).max(20).default([]),
 updatedAt:z.string().datetime(),
}).strict();
export const broadcastSchema=z.object({version:z.literal(1),opening:z.string().max(2000),closing:z.string().max(2000),stories:z.array(broadcastStorySchema).min(1).max(50)}).strict().superRefine((b,c)=>{const ids=new Set(),urls=new Set();for(const s of b.stories){if(ids.has(s.id)||urls.has(s.sourceUrl))c.addIssue({code:'custom',message:'Each article may appear only once in a broadcast'});ids.add(s.id);urls.add(s.sourceUrl);}});
export function storyFromArticle(a){return broadcastStorySchema.parse({id:a.id,articleId:a.id,sourceUrl:a.sourceUrl,title:a.title,sourceText:a.text,sourceRevision:a.revision,sourceFingerprint:a.fingerprint,publishedAt:a.publishedAt||null,sourceUpdatedAt:a.sourceUpdatedAt||null,author:a.author||'',script:a.spokenDraft?.status==='ready'&&a.spokenDraft.sourceFingerprint===a.fingerprint?a.spokenDraft.script:'',targetSeconds:45,leftAsset:'',rightAssets:[],updatedAt:new Date().toISOString()});}
export function broadcastScript(value){const b=broadcastSchema.parse(value);return b.stories.map((s,i)=>[i===0?b.opening:'',s.script.replace(/\s+/g,' ').trim(),i===b.stories.length-1?b.closing:''].filter(Boolean).join(' ')).join('\n\n');}
export function validateBroadcastReady(p){const b=broadcastSchema.parse(p.broadcast);if(b.stories.some(s=>!s.script.trim()))throw Error('Prepare and review every story script before building');if(b.stories.some(s=>!s.leftAsset||!s.rightAssets.length))throw Error('Choose a club crest and article image for every story');if(p.script!==broadcastScript(b))throw Error('Save the rundown to synchronise the narration script');if(p.scenes.length!==b.stories.length)throw Error('Save the rundown to synchronise the story scenes');return b;}

/** Split each story only after real narration timing has been reconciled. */
export function expandBroadcastMedia(model,broadcast){
 if(!broadcast)return model;const b=broadcastSchema.parse(broadcast);if(model.scenes.length!==b.stories.length)throw Error('Story/scene mapping is out of date');
 const scenes=model.scenes.flatMap((s,i)=>{const assets=b.stories[i].rightAssets,total=Math.round(s.duration*model.fps);if(!assets.length)return [s];if(total/assets.length<.2*model.fps)throw Error('Too many images for this story duration');return assets.map((asset,n)=>{const start=Math.round(n*total/assets.length),end=Math.round((n+1)*total/assets.length);return {...s,id:s.id+'-image-'+n,duration:(end-start)/model.fps,video:s.video?{...s.video,start:(s.video.start||0)+start/model.fps}:undefined,layers:s.layers.map(l=>l.id===s.id+'-article'?{...l,asset}:l)};});});
 // Looping footage uses a shared timeline offset; the renderer wraps the offset to the source length.
 if(scenes.length>100)throw Error('Use at most 100 screen image segments per broadcast');return {...model,scenes};
}
