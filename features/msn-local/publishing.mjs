const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function publication(job,input,publish,now=new Date().toISOString()){
 if(job?.status!=='complete'||!job.output)throw Error('Only completed videos can be published.');
 if(!publish)return {...job.publication,status:'unpublished',updatedAt:now};
 const title=String(input.title||'').trim(),brand=String(input.brand||'').trim(),description=String(input.description||'').trim();
 if(!title||title.length>120||brand.length>80||description.length>1000)throw Error('Enter a title up to 120 characters, brand up to 80 and description up to 1,000.');
 return {status:'published',title,brand,description,publishedAt:job.publication?.publishedAt||now,updatedAt:now};
}
export function playerPage(job){const p=job.publication;return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(p.title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#101319;color:#fff;font:14px system-ui}video{display:block;width:100%;aspect-ratio:16/9;background:#000;max-height:85vh}footer{padding:12px 18px}h1{font-size:18px;margin:4px 0}p{color:#bfc7d3;margin:6px 0}small{color:#aeb5c4}</style><video controls playsinline preload="metadata" aria-label="${escape(p.title)}" src="/published-video/${encodeURIComponent(job.id)}.mp4"></video><footer><small>${escape(p.brand)} · Local player preview</small><h1>${escape(p.title)}</h1><p>${escape(p.description)}</p><small>Updated <time datetime="${escape(p.updatedAt)}">${escape(p.updatedAt)}</time> · Not publicly hosted</small></footer></html>`;}
