import {z} from 'zod';
import type {PlexaUser} from '@/app/lib/auth/types';
import type {Agent, Data} from './model';
import {canAccessAgent} from './access';
import {workingTask} from './working-status';
export const preferencesSchema=z.object({enabled:z.boolean(),defaultAgent:z.string().max(30),size:z.enum(['small','medium','large']),bubble:z.boolean(),command:z.boolean(),animation:z.boolean(),reducedMotion:z.boolean(),rememberPosition:z.boolean(),startMinimised:z.boolean(),notifications:z.boolean(),x:z.number().min(0).max(10000),y:z.number().min(0).max(10000)});
export type CompanionPreferences=z.infer<typeof preferencesSchema>;
export const defaultPreferences:CompanionPreferences={enabled:true,defaultAgent:'bob',size:'medium',bubble:true,command:true,animation:true,reducedMotion:false,rememberPosition:true,startMinimised:false,notifications:true,x:0,y:0};
export function visibleDialogue(agent:Agent,user:PlexaUser){if(!canAccessAgent(user,agent))return [];return agent.dialogue.filter(line=>user.role==='admin'||(line.userId===user.id&&line.brand===agent.brand&&line.workspace===agent.workspace)).slice(-50);}
export function companionData(data:Data,user:PlexaUser){
 const agents=data.agents.filter(a=>canAccessAgent(user,a));
 return {version:data.version,userId:user.id,role:user.role,preferences:user.agentCompanion??defaultPreferences,agents:agents.map(a=>{const work=workingTask(a,data.tasks);return ({id:a.id,name:a.name,responsibility:a.responsibility,state:a.state,brand:a.brand,workspace:a.workspace,working:work?{title:work.title,leaseUntil:work.leaseUntil}:null,dialogue:visibleDialogue(a,user),lessons:approvedLessons(data,a)});}),tasks:data.tasks.filter(t=>agents.some(a=>a.id===t.owner&&a.brand===t.brand&&a.workspace===t.workspace)).slice(-20).map(t=>({id:t.id,owner:t.owner,title:t.title,state:t.state,output:t.output,updatedAt:t.updatedAt})),requests:user.role==='admin'?data.requests.filter(r=>r.state==='Waiting for Admin'):[],learningStatus:'Only saved, approved lessons within this agent scope are shown. Empty means no eligible records.'};
}
/** Project IDs from the browser are hints. Scope must come from saved metadata. */
export function verifiedProject(project:Record<string,unknown>|null,user:PlexaUser,agent:Agent){
 if(!project)throw Error('Project unavailable.');
 const metadata=(project.metadata??{}) as Record<string,unknown>;
 const brand=project.brand??metadata.brand,workspace=project.workspace??metadata.workspace;
 if(user.role!=='admin'&&(brand!==agent.brand||workspace!==agent.workspace||!canAccessAgent(user,agent)))throw Error('Project is outside the assigned agent scope.');
 return {projectId:project.id,title:project.title,brand:brand??null,workspace:workspace??null,templateId:project.templateId??null,status:project.status||'Not recorded',articles:metadata.articleIds??[],media:project.scenes??[]};
}

// Read-only adapter for the existing agent-learning records. No second memory store.
const lessonSchema=z.object({id:z.string(),agentId:z.string(),brand:z.string(),workspace:z.string(),project:z.string(),scope:z.enum(['private','project','platform']),category:z.string(),observation:z.string(),solution:z.string(),status:z.string(),approvedBy:z.string().optional(),taskTypes:z.array(z.string()).optional()});
export function approvedLessons(data:Data,agent:Agent,projectId?:string){
 const records=(data as Data&{lessons?:unknown[]}).lessons??[];
 return records.flatMap(record=>{const result=lessonSchema.safeParse(record);if(!result.success)return [];const l=result.data;
 if(l.status!=='Approved'||!l.approvedBy)return [];
 if(l.taskTypes&&!l.taskTypes.some(t=>['general',...(['bob','fiddle'].includes(agent.id)?['editorial','script','narration','render']:['engineering'])].includes(t)))return [];
 if(l.scope!=='platform'&&(l.brand!==agent.brand||l.workspace!==agent.workspace||(l.scope==='private'&&l.agentId!==agent.id)||(l.scope==='project'&&l.project!==projectId)))return [];
 return [{id:l.id,category:l.category,observation:l.observation,solution:l.solution}];}).slice(-20);
}
