import {z} from 'zod';
export const providers=['motion','elevenlabs','openai','cursor','supabase','netlify'] as const;
const text=z.string().trim().min(1).max(200);
const amount=z.number().finite().nonnegative().max(1e12);
const unit=z.string().regex(/^[A-Z][A-Z0-9_-]{1,39}$/);
const dimensions={provider:text,unit,brand:z.string().max(100).default(''),workspace:z.string().max(100).default(''),agent:z.string().max(100).default(''),taskId:z.string().max(200).default(''),projectId:z.string().max(200).default('')};
export const commandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('reconcile'),projectId:text,unit,fingerprint:z.string().regex(/^[a-f0-9]{64}$/),notes:z.string().trim().min(10).max(2000),idempotencyKey:text}),
 z.object({action:z.literal('record'),...dimensions,amount,kind:z.enum(['subscription','production','delivery','allocation','topup','refund','adjustment']),date:z.string().datetime(),billingEntity:text,reference:text,notes:z.string().max(2000).default(''),idempotencyKey:text}),
 z.object({action:z.literal('budget'),...dimensions,limit:amount,period:z.enum(['day','month','all']),idempotencyKey:text}),
 z.object({action:z.literal('target'),brand:z.string().max(100).default(''),unit,amount,idempotencyKey:text}),
]);
export type Command=z.infer<typeof commandSchema>;
type Scope={provider:string;unit:string;brand:string;workspace:string;agent:string;taskId:string;projectId:string};
export type Entry=Scope&{id:string;amount:number;kind:'subscription'|'production'|'delivery'|'allocation'|'topup'|'refund'|'adjustment';date:string;billingEntity:string;reference:string;notes:string;idempotencyKey:string;actor:string;recordedAt:string;source:'manual'};
export type Budget=Scope&{id:string;limit:number;period:'day'|'month'|'all';actor:string;at:string};
export type Target={brand:string;unit:string;amount:number;actor:string;at:string};
export type Reservation=Scope&{id:string;operation:string;route:'api'|'mcp';estimate:number;actual?:number;status:'reserved'|'settled'|'uncertain';at:string;providerJobId?:string};
export type CostData={version:number;entries:Entry[];budgets:Budget[];targets:Target[];reservations:Reservation[];audit:Array<{id:string;actor:string;at:string;command:Command}>};
export const initialCosts=():CostData=>({version:0,entries:[],budgets:[],targets:[],reservations:[],audit:[]});
export function applyCostCommand(data:CostData,command:Command,actor:string,role:string,now:string,id:string){
 if(role!=='admin')throw Error('Admin access required.');
 const previous=data.audit.find(a=>a.command.idempotencyKey===command.idempotencyKey);
 if(previous){if(JSON.stringify(previous.command)!==JSON.stringify(command))throw Error('Duplicate key has different content.');return data;}
 const d=structuredClone(data);
 if(command.action==='record'){
  if(d.entries.some(e=>e.billingEntity===command.billingEntity&&e.reference===command.reference&&e.kind===command.kind&&e.unit===command.unit))throw Error('This billing reference is already recorded.');
  d.entries.push({...command,id,actor,recordedAt:now,source:'manual'});
 }else if(command.action==='budget')d.budgets.push({...command,id,actor,at:now});
 else if(command.action==='target')d.targets.push({...command,actor,at:now});
 d.audit.push({id,actor,at:now,command});d.version++;return d;
}
const scopeFields=['provider','unit','brand','workspace','agent','taskId','projectId'] as const;
const matches=(b:Scope,o:Scope)=>scopeFields.every(k=>!b[k]||b[k]===o[k]);
const inPeriod=(date:string,now:string,period:Budget['period'])=>period==='all'||date.slice(0,period==='day'?10:7)===now.slice(0,period==='day'?10:7);
export function currentBudgets(data:CostData){const map=new Map<string,Budget>();for(const b of data.budgets)map.set(JSON.stringify([...scopeFields.map(k=>b[k]),b.period]),b);return [...map.values()];}
export function budgetUsed(data:CostData,b:Budget,now:string){
 return data.entries.filter(e=>matches(b,e)&&inPeriod(e.date,now,b.period)&&['production','delivery','subscription','allocation','adjustment'].includes(e.kind)).reduce((n,e)=>n+e.amount,0)+data.reservations.filter(r=>matches(b,r)&&inPeriod(r.at,now,b.period)).reduce((n,r)=>n+(r.actual??r.estimate),0);
}
/** Invoke inside the store's compare-and-swap transaction BEFORE provider submission. Route is not an operation identity. */
export function reserveCost(data:CostData,request:Omit<Reservation,'status'|'at'>,now:string){
 if(!Number.isFinite(request.estimate)||request.estimate<0)throw Error('Reliable estimate required; request Admin review.');
 const prior=data.reservations.find(r=>r.id===request.id);
 if(prior){const same=scopeFields.every(k=>prior[k]===request[k])&&prior.operation===request.operation&&prior.estimate===request.estimate;if(!same)throw Error('Operation identity conflict.');return {data,reservation:prior,existing:true};}
 const budgets=currentBudgets(data).filter(b=>matches(b,request));
 if(!budgets.length)throw Error('No approved spending budget.');
 for(const b of budgets)if(budgetUsed(data,b,now)+request.estimate>b.limit)throw Error('Budget exceeded. Admin review required.');
 const d=structuredClone(data),reservation:Reservation={...request,status:'reserved',at:now};d.reservations.push(reservation);d.version++;return {data:d,reservation,existing:false};
}
export function settleCost(data:CostData,id:string,actual:number|null,providerJobId?:string){
 const d=structuredClone(data),r=d.reservations.find(x=>x.id===id);if(!r)throw Error('Reservation not found.');
 if(actual!==null&&(!Number.isFinite(actual)||actual<0))throw Error('Invalid actual usage.');
 if(r.status==='settled'){if(r.actual!==actual||r.providerJobId!==providerJobId)throw Error('Reconciliation conflict.');return data;}
 if(actual===null){r.status='uncertain';}else{r.actual=actual;r.status='settled';}r.providerJobId=providerJobId;d.version++;return d;
}
export function projectCosts(data:CostData,projectId:string,unit:string,durationSeconds?:number){
 const entries=data.entries.filter(e=>e.projectId===projectId&&e.unit===unit);
 const jobs=data.reservations.filter(r=>r.projectId===projectId&&r.unit===unit);
 const direct=entries.filter(e=>e.kind==='production').reduce((n,e)=>n+e.amount,0)+jobs.filter(r=>r.actual!==undefined).reduce((n,r)=>n+r.actual!,0);
 const hasDirect=entries.some(e=>e.kind==='production')||jobs.some(r=>r.actual!==undefined);
 return {direct:hasDirect?direct:null,allocated:entries.filter(e=>e.kind==='allocation').reduce((n,e)=>n+e.amount,0),delivery:entries.some(e=>e.kind==='delivery')?entries.filter(e=>e.kind==='delivery').reduce((n,e)=>n+e.amount,0):null,perMinute:hasDirect&&durationSeconds&&durationSeconds>0?direct/(durationSeconds/60):null,status:'Partial' as const};
}
