import {requireAdmin} from '@/app/lib/auth/guards';
import {hostedWorkspace} from '@/app/lib/studio-workspace/store';
import {readCosts,updateCosts,Conflict,InvalidCostCommand} from '@/app/lib/costs/store';
import {videoCosts} from '@/app/lib/costs/videos';
import {commandSchema} from '@/app/lib/costs/model';
import {isWorkspaceSameOrigin} from '@/app/lib/studio-workspace/origin';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const auth=await requireAdmin(request);if('response'in auth)return auth.response;
 const url=new URL(request.url),unit=url.searchParams.get('unit')||'GBP';
 if(!/^[A-Z][A-Z0-9_-]{1,39}$/.test(unit))return Response.json({error:'Invalid unit'},{status:400});
 try{const [data,{state}]=await Promise.all([readCosts(),hostedWorkspace().snapshot()]);let videos=videoCosts(data,state,unit);const id=url.searchParams.get('project');if(id){videos=videos.filter(v=>v.id===id);if(!videos.length)return Response.json({error:'Project not found'},{status:404});}return Response.json({videos,version:data.version},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Video cost records unavailable. Retry when the workspace is available.'},{status:503});}
}
export async function POST(request:Request){
 const auth=await requireAdmin(request);if('response'in auth)return auth.response;
 if(!isWorkspaceSameOrigin(request))return Response.json({error:'Same-origin request required'},{status:403});
 const body=await request.json().catch(()=>null),parsed=commandSchema.safeParse(body?.command);
 if(!parsed.success||parsed.data.action!=='reconcile'||!Number.isSafeInteger(body?.version)||body.version<0)return Response.json({error:'Invalid reconciliation'},{status:400});
 const command=parsed.data;
 try{const [data,{state}]=await Promise.all([readCosts(),hostedWorkspace().snapshot()]);const row=videoCosts(data,state,command.unit).find(v=>v.id===command.projectId);
 if(!row)return Response.json({error:'Project not found'},{status:404});
 if(!row.completed||row.attempts.some(j=>['queued','running','saving'].includes(j.status))||data.reservations.some(r=>r.projectId===row.id&&r.unit===row.unit&&r.status!=='settled'))return Response.json({error:'Resolve active attempts and unsettled costs first'},{status:409});
 if(row.fingerprint!==parsed.data.fingerprint)throw new Conflict('Video costs changed. Refresh before reconciling.');
 return Response.json(await updateCosts(parsed.data,body.version,auth.user.id));
 }catch(e){return Response.json({error:e instanceof Conflict||e instanceof InvalidCostCommand?e.message:'Cost reconciliation unavailable. Retry after refreshing.'},{status:e instanceof Conflict?409:e instanceof InvalidCostCommand?400:503});}
}
