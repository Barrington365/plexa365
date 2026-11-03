import {createHash} from 'node:crypto';
import {projectCosts,type CostData} from './model';
export type Project={id:string;title?:string;brand?:string;templateId?:string;updatedAt?:string;metadata?:{brand?:string;tags?:string[]};trashedAt?:string};
export type Job={id:string;status:string;createdAt?:string;updatedAt?:string;request?:{kind?:string;projectId?:string;project?:Project};publication?:{brand?:string};output?:{asset?:string;duration?:number;title?:string}};
export type Workspace={projects:Project[];jobs:Job[]};
export function videoCosts(data:CostData,state:Workspace,unit:string){
 const ids=new Set([...state.projects.map(p=>p.id),...state.jobs.map(j=>j.request?.projectId).filter((id):id is string=>!!id)]);
 return [...ids].map(id=>{
  const attempts=state.jobs.filter(j=>j.request?.projectId===id).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''));
  const renders=attempts.filter(j=>j.request?.kind==='studio');
  const complete=renders.filter(j=>j.status==='complete'&&j.output?.asset);
  const latest=complete.at(-1), project=state.projects.find(p=>p.id===id)||attempts.at(-1)?.request?.project||{id};
  const tagBrand=(latest?.request?.project?.metadata?.tags||project.metadata?.tags||[]).find(t=>['Football365','TEAMtalk','PlanetF1','F1Live365'].includes(t));
  const brand=latest?.publication?.brand||tagBrand||latest?.request?.project?.brand||latest?.request?.project?.metadata?.brand||project.brand||project.metadata?.brand||'';
  const template=latest?.request?.project?.templateId||project.templateId||'';
  const entries=data.entries.filter(e=>e.projectId===id&&e.unit===unit);
  const reservations=data.reservations.filter(r=>r.projectId===id&&r.unit===unit);
  // Changes to any attempt or source cost invalidate an earlier completeness approval.
  const fingerprint=createHash('sha256').update(JSON.stringify({attempts,entries,reservations,unit})).digest('hex');
  const approved=data.audit.filter(a=>a.command.action==='reconcile'&&a.command.projectId===id&&a.command.unit===unit).at(-1);
  const reconciled=!!latest&&approved?.command.action==='reconcile'&&approved.command.fingerprint===fingerprint&&!attempts.some(j=>['queued','running','saving'].includes(j.status))&&!reservations.some(r=>r.status!=='settled');
  const duration=typeof latest?.output?.duration==='number'&&latest.output.duration>0?latest.output.duration:null;
  const costs=projectCosts(data,id,unit,duration||undefined);
  const total=(costs.direct??0)+costs.allocated;
  const target=[...data.targets].reverse().find(t=>t.brand===brand&&t.unit===unit)||[...data.targets].reverse().find(t=>!t.brand&&t.unit===unit);
  const providers=[...new Set([...entries.map(e=>e.provider),...reservations.map(r=>r.provider)])];
  return {id,title:latest?.output?.title||project.title||id,brand,template,templateVersion:latest?.request?.project?.updatedAt||null,trashed:!!project.trashedAt,completed:!!latest,completedAt:latest?.updatedAt||null,outputAsset:latest?.output?.asset||null,duration,unit,...costs,status:renders.at(-1)?.status||'draft',statusOfCosts:reconciled?'Reconciled':'Partial',total:reconciled?total:null,recordedTotal:total,perMinute:reconciled&&duration?total/(duration/60):null,target:target?.amount??null,variance:reconciled&&target?total-target.amount:null,fingerprint,attempts:attempts.map(j=>({id:j.id,kind:j.request?.kind||'unknown',status:j.status,at:j.createdAt||null})),renderCount:renders.length,failedAttempts:attempts.filter(j=>['failed','cancelled','interrupted'].includes(j.status)).length,providers,breakdown:providers.map(provider=>({provider,direct:entries.filter(e=>e.provider===provider&&e.kind==='production').reduce((n,e)=>n+e.amount,0)+reservations.filter(r=>r.provider===provider&&r.actual!==undefined).reduce((n,r)=>n+r.actual!,0),allocated:entries.filter(e=>e.provider===provider&&e.kind==='allocation').reduce((n,e)=>n+e.amount,0),delivery:entries.filter(e=>e.provider===provider&&e.kind==='delivery').reduce((n,e)=>n+e.amount,0)}))};
 });
}
export type VideoCost=ReturnType<typeof videoCosts>[number];
export function videoSummary(rows:VideoCost[]){const completed=rows.filter(r=>r.completed),known=completed.filter(r=>r.total!==null),timed=known.filter(r=>r.duration!==null);return {completed:completed.length,reconciled:known.length,partial:completed.length-known.length,average:known.length?known.reduce((n,r)=>n+r.total!,0)/known.length:null,perMinute:timed.length?timed.reduce((n,r)=>n+r.total!,0)/(timed.reduce((n,r)=>n+r.duration!,0)/60):null};}
