import {requireUser} from '../../app/lib/auth/guards';
import {hostedWorkspace,workspaceObjects} from '../../app/lib/studio-workspace/store';
import {runWorkspaceRender,patchWorkspaceJob} from '../../features/msn-local/workspace-render.mjs';
import {activateWorkspaceImport} from '../../features/msn-local/workspace-migration.mjs';

export default async (request:Request)=>{
  if(request.method!=='POST')return new Response(null,{status:405});
  const auth=await requireUser(request);
  if('response' in auth)return auth.response;
  if(!['admin','editor'].includes(auth.user.role))return new Response(null,{status:403});
  const body=await request.json();
  if(typeof body.jobId!=='string'||!/^[a-f0-9-]{36}$/.test(body.jobId))return new Response(null,{status:400});
  const workspace=hostedWorkspace();
  const job=(await workspace.snapshot()).state.jobs.find((j:{id:string})=>j.id===body.jobId);
  if(!job||(job.createdBy!==auth.user.id&&auth.user.role!=='admin'))return new Response(null,{status:403});
  if(job.status!=='queued')return new Response(null,{status:409});
  if(job.request?.kind==='import'){
    if(auth.user.role!=='admin')return new Response(null,{status:403});
    // Claim outside the failure handler: a duplicate worker must not fail the original.
    await workspace.update((state:{jobs:Array<{id:string,status:string,updatedAt:string}>})=>{
      const current=state.jobs.find(j=>j.id===body.jobId);
      if(!current||current.status!=='queued')throw Error('Import already claimed');
      const now=new Date().toISOString();
      Object.assign(current,{status:'running',startedAt:now,updatedAt:now});
      return true;
    });
    try{
      const manifest=await workspaceObjects().get('studio-import/manifests/'+job.request.importId+'.json',{type:'json'});
      const result=await activateWorkspaceImport(workspace,manifest,job.request.importId);
      await patchWorkspaceJob(workspace,body.jobId,{status:'complete',progress:100,stage:'Workspace imported and verified',result});
    }catch(error){
      await patchWorkspaceJob(workspace,body.jobId,{status:'failed',stage:error instanceof Error?error.message:'Import failed'});
      throw error;
    }
  }else if(job.request?.kind==='article-script'){
    const {getServerSecretAsync}=await import('../../app/lib/server-secrets');
    const {runArticleScript}=await import('../../features/msn-local/article-script.mjs');
    await runArticleScript(workspace,body.jobId,await getServerSecretAsync('OPENAI_API_KEY')||'');
  }else if(job.request?.kind==='voice-review'){
    const {getServerSecretAsync}=await import('../../app/lib/server-secrets');
    const {runVoiceReview}=await import('../../features/msn-local/voice-review.mjs');
    await runVoiceReview(workspace,body.jobId,await getServerSecretAsync('ELEVENLABS_API_KEY')||'');
  }else if(job.request?.kind==='narration'){
    const {getServerSecretAsync}=await import('../../app/lib/server-secrets');
    const {runWorkspaceNarration}=await import('../../features/msn-local/workspace-narration.mjs');
    await runWorkspaceNarration(workspace,body.jobId,await getServerSecretAsync('ELEVENLABS_API_KEY')||'');
  }else{
    const {getServerSecretAsync}=await import('../../app/lib/server-secrets');
    await runWorkspaceRender(workspace,body.jobId,{key:job.request?.project?.productionProfile==='football365-news-studio-v1'?await getServerSecretAsync('ELEVENLABS_API_KEY')||'':''});
  }
  return new Response(null,{status:200});
};
