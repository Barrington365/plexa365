/* Split large file uploads to respect hosting request limits. Originals are unmodified. */
(()=>{const originalFetch=window.fetch.bind(window);window.fetch=async(input,options)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:'';
 if(!url.startsWith('/api/studio-workspace/')||options?.method!=='POST'||typeof options.body!=='string')return originalFetch(input,options);
 if(url.endsWith('/elevenlabs/generate')||url.endsWith('/elevenlabs/audition')){
  const response=await originalFetch(input,options);if(response.status!==202)return response;const job=await response.json();
  for(let attempt=0;attempt<450;attempt++){await new Promise(resolve=>setTimeout(resolve,2000));const statusResponse=await originalFetch('/api/studio-workspace/state');if(!statusResponse.ok)throw Error('Narration status unavailable. The worker may still finish; check the saved project before retrying.');const state=await statusResponse.json(),current=state.jobs.find(j=>j.id===job.id);if(current?.status==='complete'&&current.result)return new Response(JSON.stringify(current.result),{status:200,headers:{'Content-Type':'application/json'}});if(['failed','cancelled','interrupted'].includes(current?.status))throw Error(current.stage||'Narration did not complete');}
  throw Error('Narration status timed out. Check the saved project before retrying.');
 }
 let body;try{body=JSON.parse(options.body);}catch{return originalFetch(input,options);}
 if(typeof body.base64!=='string'||body.base64.length<900000)return originalFetch(input,options);
 const decoded=atob(body.base64);if(decoded.length>14e6)throw Error('Choose a file under 14 MB');const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));const chunks=[];
 for(let start=0;start<bytes.length;start+=1024*1024){const response=await originalFetch('/api/studio-workspace/chunk',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes.slice(start,start+1024*1024)});const part=await response.json();if(!response.ok||!part.chunk)throw Error(part.error||'Upload chunk failed');chunks.push(part.chunk);}
 const hash=await crypto.subtle.digest('SHA-256',bytes);body.file={bytes:bytes.length,sha256:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join(''),chunks};delete body.base64;return originalFetch(input,{...options,body:JSON.stringify(body)});
 };})();
