import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text.trim().replace(/\s+/g,' ')).digest('hex');
function safeUrl(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password)return '';u.hash='';for(const k of [...u.searchParams.keys()])if(k.startsWith('utm_')||['fbclid','gclid'].includes(k))u.searchParams.delete(k);u.hostname=u.hostname.replace(/^www\./,'');u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.href;}catch{return '';}}
/** Read-through importer view. Existing project IDs, images and draft evidence survive refreshes. */
export function importedArticleView(inbox={},articles={}){
 const rows=[...(inbox.articles||[])];
 const imported=Object.values(articles).sort((a,b)=>String(a.updatedAt||'').localeCompare(String(b.updatedAt||'')));
 for(const a of imported){
  const sourceUrl=safeUrl(a.canonicalUrl||a.sourceUrl),text=String(a.body||a.standfirst||'').trim(),title=String(a.title||'').trim();
  if(!a.id||!sourceUrl||!title)continue;
  const existing=rows.find(r=>r.languageArticleId===a.id||(r.brand===a.sourceBrand&&safeUrl(r.sourceUrl)===sourceUrl));
  const fingerprint=hash(text),changed=existing&&existing.fingerprint!==fingerprint;
  const record={...existing,id:existing?.id||'language:'+a.id,languageArticleId:a.id,languageImportId:a.importId,brand:a.sourceBrand||'Unknown brand',title,text,sourceUrl:a.canonicalUrl||a.sourceUrl,author:a.author||'',publishedAt:a.publishDate||null,sourceUpdatedAt:a.modifiedDate||a.updatedAt,sourceFetchedAt:a.updatedAt,firstDetectedAt:existing?.firstDetectedAt||a.createdAt||a.updatedAt||'1970-01-01T00:00:00.000Z',updatedAt:a.updatedAt||a.createdAt,source:'Import',importMethod:'import',contentKind:'article',sourceDetail:'From Language Studio importer',sourceId:a.sourceArticleId||a.id,fingerprint,revision:existing?(existing.revision||1)+(changed?1:0):1,status:existing?.status||'imported',projectId:existing?.projectId||null,reviewRequired:existing?.reviewRequired||Boolean(changed&&existing?.projectId),sourceImages:safeUrl(a.imageUrl)?[a.imageUrl]:existing?.sourceImages||[],images:existing?.images?.length?existing.images:safeUrl(a.imageUrl)?[{id:'language-image:'+a.id,url:a.imageUrl,name:title+' · original',kind:'original',importerImage:true}]:[]};
  if(existing)rows[rows.indexOf(existing)]=record;else rows.push(record);
 }
 // Removed importer rows disappear unless they have retained editorial work.
 const ids=new Set(Object.keys(articles));
 return {...inbox,articles:rows.filter(r=>!r.languageArticleId||ids.has(r.languageArticleId)||r.projectId||r.spokenDraft||r.status==='held'),source:'language-importer'};
}
