import {requireUser} from '@/app/lib/auth/guards';import {getServerSecretAsync} from '@/app/lib/server-secrets';import {accountVoices} from '@/features/msn-local/elevenlabs.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{action:string}>}){
 const auth=await requireUser(request);if('response' in auth)return auth.response;if(!['admin','editor','viewer'].includes(auth.user.role))return Response.json({error:'Studio access required'},{status:403});
 const {action}=await params;if(!['status','voices'].includes(action))return Response.json({error:'Unknown voice action'},{status:404});
 try{const key=await getServerSecretAsync('ELEVENLABS_API_KEY');if(action==='status')return Response.json({configured:!!key,configurationSource:key?'Existing Studio connection':'not configured'},{headers:{'Cache-Control':'no-store'}});return Response.json({voices:await accountVoices(key||''),updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:error instanceof Error?error.message:'Account voices unavailable'},{status:503});}
}

export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
 const auth=await requireUser(request);if('response' in auth)return auth.response;if(!['admin','editor'].includes(auth.user.role))return Response.json({error:'Editing access required'},{status:403});if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Same-origin request required'},{status:403});
 if((await params).action!=='generate')return Response.json({error:'Manage the existing provider connection in Studio administration.'},{status:400});
 const {shouldUseNetlifyBlobStore}=await import('@/app/lib/netlify-blob-json');if(!shouldUseNetlifyBlobStore())return Response.json({error:'Paid generation is disabled in the local hosted-workspace test harness.'},{status:503});
 const {hostedWorkspace}=await import('@/app/lib/studio-workspace/store');const {queueWorkspaceNarration}=await import('@/features/msn-local/workspace-narration.mjs');const {patchWorkspaceJob}=await import('@/features/msn-local/workspace-render.mjs');const workspace=hostedWorkspace();let job;
 try{job=await queueWorkspaceNarration(workspace,await request.json(),auth.user.id);const response=await fetch(new URL('/.netlify/functions/studio-workspace-build-background',request.url),{method:'POST',headers:{'Content-Type':'application/json',cookie:request.headers.get('cookie')||''},body:JSON.stringify({jobId:job.id}),signal:AbortSignal.timeout(15000)});if(response.status!==202)throw Error('Narration worker did not accept the job');return Response.json(job,{status:202});}catch(error){const message=error instanceof Error?error.message:'Narration could not start';if(job)await patchWorkspaceJob(workspace,job.id,{status:'failed',stage:message});return Response.json({error:message},{status:503});}
}
