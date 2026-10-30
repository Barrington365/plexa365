import {canonicalUrl} from './article-inbox.mjs';
const decode=s=>s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,v)=>{const n=v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_,v)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[v]));
const plain=s=>decode(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
export function parsePublisherArticle(html,url,brand='Football365'){
 const canonical=canonicalUrl(url,brand);let ld;
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{const value=JSON.parse(m[1]);const entries=Array.isArray(value)?value:value['@graph']||[value];ld=entries.find(v=>['NewsArticle','Article'].includes(v['@type']))||ld;}catch{}}
 const section=html.match(/<!-- Article Start -->([\s\S]*?)(?:<!-- Article End -->|<\/article>)/i)?.[1];
 if(!ld||!section)throw Error('Article extraction unavailable: original article body could not be identified');
 const text=[...section.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>plain(m[1])).filter(p=>p&&!/^(READ(?: MORE| NEXT|:)|MORE |FOLLOW |JOIN |SUBSCRIBE)/i.test(p)).join('\n\n');
 if(text.length<100)throw Error('Article body is too short; add approved material');
 const iso=x=>x&&Number.isFinite(Date.parse(x))?new Date(x).toISOString():null;
 return {brand,sourceUrl:canonical,title:plain(ld.headline||ld.name||''),text,importMethod:'import',sourceId:String(ld.mainEntityOfPage?.['@id']||canonical),publishedAt:iso(ld.datePublished),sourceUpdatedAt:iso(ld.dateModified),author:(Array.isArray(ld.author)?ld.author:[ld.author]).filter(Boolean).map(a=>a.name||'').join(', '),sourceImages:[typeof ld.image==='string'?ld.image:ld.image?.url].filter(Boolean),sourceFetchedAt:new Date().toISOString()};
}
export async function fetchPublisherArticle(url,brand='Football365',fetcher=fetch){
 let next=canonicalUrl(url,brand);
 for(let i=0;i<4;i++){const r=await fetcher(next,{redirect:'manual',signal:AbortSignal.timeout(20000)});if([301,302,303,307,308].includes(r.status)){next=canonicalUrl(new URL(r.headers.get('location'),next).href,brand);continue;}if(!r.ok)throw Error('Article fetch failed (HTTP '+r.status+')');if(!r.headers.get('content-type')?.includes('text/html'))throw Error('Article did not return HTML');const text=await r.text();if(text.length>3_000_000)throw Error('Article page exceeds import limit');return parsePublisherArticle(text,next,brand);}throw Error('Article redirected too many times');
}

export async function fetchPublisherImage(url,fetcher=fetch){
 const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||!['www.football365.com','d2x51gyc4ptf2q.cloudfront.net'].includes(u.hostname))throw Error('Source image host needs editorial review');
 const r=await fetcher(u,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok||!/^image\/(jpeg|png|webp)(;|$)/i.test(r.headers.get('content-type')||''))throw Error('Article image could not be fetched');
 const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>10_000_000)throw Error('Article image exceeds 10 MB');chunks.push(chunk);}return Buffer.concat(chunks);
}

/** Retry only rejected conditional writes; each attempt reads the latest saved state. */
export async function retryImportConflict(operation){for(let attempt=0;attempt<4;attempt++){try{return await operation();}catch(error){if(attempt===3||!String(error.message).includes('Another editor'))throw error;}}}
