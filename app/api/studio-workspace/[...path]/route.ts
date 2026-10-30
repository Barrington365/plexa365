import {isWorkspaceSameOrigin, workspaceOrigin} from '@/app/lib/studio-workspace/origin';
import {requireUser} from '@/app/lib/auth/guards';import {hostedWorkspace} from '@/app/lib/studio-workspace/store';import {workspaceRead,workspaceWrite} from '@/features/msn-local/workspace-api.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
export async function GET(request:Request,{params}:Context){
 const auth=await requireUser(request);if('response' in auth)return auth.response;if(!['admin','editor','viewer'].includes(auth.user.role))return Response.json({error:'Studio access required'},{status:403});
 const parts=(await params).path,workspace=hostedWorkspace();
 try{if(['asset','video','published-video'].includes(parts[0])&&parts.length===2){const state=(await workspace.snapshot()).state;const id=parts[1].replace(/\.mp4$/,'');const source=parts[0]!=='asset'?state.jobs.find((j:{id:string})=>j.id===id)?.output:state.sourceClips?.find((c:{id:string})=>c.id===id)||state.jobs.find((j:{id:string})=>'built-'+j.id===id)?.output;if(parts[0]==='published-video'&&state.jobs.find((j:{id:string})=>j.id===id)?.publication?.status!=='published')return Response.json({error:'Player unavailable'},{status:404});if(!source?.asset)return Response.json({error:'Video not found'},{status:404});const url=new URL('/api/studio-workspace/media',workspaceOrigin(request));url.searchParams.set('asset',source.asset);if(new URL(request.url).searchParams.has('download'))url.searchParams.set('download','1');return Response.redirect(url,307);}if(parts[0]==='image'&&parts.length===2){const {state}=await workspace.snapshot();if(!state.images.some((i:{id:string})=>i.id===parts[1]))return Response.json({error:'Image not found'},{status:404});const url=new URL('/api/studio-workspace/media',workspaceOrigin(request));url.searchParams.set('asset','images/'+parts[1]+'.png');if(new URL(request.url).searchParams.has('download'))url.searchParams.set('download','1');return Response.redirect(url,307);}return Response.json(await workspaceRead(workspace,parts.join('/')),{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'Studio content could not be loaded. Saved content has not been replaced.'},{status:503});}
}
export async function POST(request:Request,{params}:Context){
 const auth=await requireUser(request);if('response' in auth)return auth.response;if(!['admin','editor'].includes(auth.user.role))return Response.json({error:'Editing access required'},{status:403});
 if(!isWorkspaceSameOrigin(request))return Response.json({error:'Same-origin request required'},{status:403});
 try{const raw=await request.text();if(raw.length>2_000_000)return Response.json({error:'Request too large'},{status:413});const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid request');const route=(await params).path.join('/');const workspace=hostedWorkspace();
 if(route==='article-inbox/rewrite'){return Response.json(await prepareScript(request,workspace,body.id,auth.user.id),{headers:{'Cache-Control':'no-store'}});}
 if(route==='article-inbox/from-language-studio'){
 const {readLanguageStudioData}=await import('@/app/lib/language-studio/store');
 const {bringLanguageArticles,languageInboxPayloads}=await import('@/features/msn-local/language-inbox-bridge.mjs');
 const data=await readLanguageStudioData();
 const snap=await workspace.snapshot();
 const existing=(snap.state.inbox?.articles||[]).map((article:{sourceUrl?:string})=>article.sourceUrl||'');
 const result=await bringLanguageArticles(languageInboxPayloads(data.articles),existing,(raw)=>workspaceWrite(workspace,'article-inbox/import',raw));
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }
 if(route==='article-inbox/import-url'){
 const {fetchPublisherArticle,fetchPublisherImage,retryImportConflict}=await import('@/features/msn-local/article-url.mjs');
 const article=await fetchPublisherArticle(body.sourceUrl,body.brand||'Football365');
 const result=await retryImportConflict(()=>workspaceWrite(workspace,'article-inbox/import',article));
 if(result.error)return Response.json(result,{status:400});
 const current=(await workspace.snapshot()).state;
 if(article.sourceImages[0]&&!current.images.some((i:{sourceUrl:string})=>i.sourceUrl===article.sourceUrl)){
 try{const bytes=await fetchPublisherImage(article.sourceImages[0]);await workspaceWrite(workspace,'images/import',{name:article.title+' · article original',sourceUrl:article.sourceUrl,base64:bytes.toString('base64')});}catch(error){result.imageError=error instanceof Error?error.message:'Article image requires manual import';}
 }

 if(body.prepareScript!==false){try{result.scriptPreparation=await retryImportConflict(()=>prepareScript(request,workspace,result.article.id,auth.user.id));}catch(error){result.rewriteError=error instanceof Error?error.message:'Script preparation unavailable';}}
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }
 const result=await workspaceWrite(workspace,route,body);
 if(route==='article-inbox/import'&&result.article&&!result.error&&body.prepareScript!==false){try{result.scriptPreparation=await prepareScript(request,workspace,result.article.id,auth.user.id);}catch(error){result.rewriteError=error instanceof Error?error.message:'Original article saved; script preparation unavailable';}}if(route==='images/preview')return new Response(new Uint8Array(result),{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store'}});return Response.json(result,{status:result?.error?409:200,headers:{'Cache-Control':'private, no-store'}});}catch(error){const message=error instanceof Error?error.message:'Studio action failed';return Response.json({error:message},{status:/changed|Another editor/.test(message)?409:400});}
}

async function prepareScript(request:Request,workspace:ReturnType<typeof hostedWorkspace>,articleId:string,userId:string){
 const {shouldUseNetlifyBlobStore}=await import('@/app/lib/netlify-blob-json');if(!shouldUseNetlifyBlobStore())throw Error('Original article saved. Paid rewriting is disabled in the local QA workspace.');
 const {queueArticleScript,failArticleScript}=await import('@/features/msn-local/article-script.mjs');const job=await queueArticleScript(workspace,articleId,userId);if(job.existing)return job;
 try{const r=await fetch(new URL('/.netlify/functions/studio-workspace-build-background',workspaceOrigin(request)),{method:'POST',headers:{'Content-Type':'application/json',cookie:request.headers.get('cookie')||''},body:JSON.stringify({jobId:job.id}),signal:AbortSignal.timeout(15000)});if(r.status!==202)throw Error('Script worker did not accept the job. Original article saved.');return {status:'queued',jobId:job.id};}catch(e){await failArticleScript(workspace,job.id,e instanceof Error?e.message:'Script worker unavailable');throw e;}
}
