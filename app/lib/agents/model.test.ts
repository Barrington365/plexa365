import { describe,it,expect } from "vitest";
import { applyCommand,initialData,commandSchema,type Command } from "./model";
const now="2026-10-31T12:00:00Z";
function configured(){return applyCommand(initialData(),{action:"configure",agentId:"bob",responsibility:"Video",brand:"F365",workspace:"Editorial"},"admin",now,"config");}
const task:Command={action:"task",owner:"bob",title:"Prepare video",source:"request-1",brand:"F365",workspace:"Editorial",priority:"Normal"};
describe("Agent management boundaries",()=>{
 it("configuration approval never starts execution and is invalidated by edits",()=>{
   let d=applyCommand(configured(),{action:"approval",agentId:"bob",reason:"Review"},"admin",now,"request");
   d=applyCommand(d,{action:"decision",requestId:"request",decision:"approve",note:"Reviewed configuration"},"admin",now,"decision");
   expect(d.agents[0]).toMatchObject({approved:true,state:"Paused"});
   d=applyCommand(d,{action:"configure",agentId:"bob",responsibility:"Updated role",brand:"F365",workspace:"Editorial"},"admin",now,"edit");
   expect(d.agents[0].approved).toBe(false);
 });
 it("defaults every agent to paused without approval",()=>{expect(initialData().agents).toHaveLength(8);expect(initialData().agents.every(a=>a.state==="Paused"&&!a.approved)).toBe(true);});
 it("rejects activation and permission commands",()=>{expect(commandSchema.safeParse({action:"activate",agentId:"bob"}).success).toBe(false);});
 it("rejects unconfigured and cross-workspace assignments",()=>{expect(()=>applyCommand(initialData(),task,"admin",now,"t")).toThrow("Configure");expect(()=>applyCommand(configured(),{...task,workspace:"Other"},"admin",now,"t")).toThrow("Configure");});
 it("records actor, ownership and timestamp without changing the input",()=>{const d=configured();const next=applyCommand(d,task,"admin",now,"t");expect(d.tasks).toHaveLength(0);expect(next.tasks[0]).toMatchObject({owner:"bob",state:"Paused",createdAt:now});expect(next.history.at(-1)).toMatchObject({actor:"admin",subject:"t"});});
 it("rejects duplicate requests even under another title",()=>{const d=applyCommand(configured(),task,"admin",now,"t");expect(()=>applyCommand(d,{...task,title:"New title"},"admin",now,"t2")).toThrow("already");});
 it("blocks execution and completion without evidence",()=>{const d=applyCommand(configured(),task,"admin",now,"t");const c:Command={action:"transition",taskId:"t",state:"Working",note:"start",output:"",checks:"",issues:""};expect(()=>applyCommand(d,c,"admin",now,"e")).toThrow("paused");expect(()=>applyCommand(d,{...c,state:"Completed"},"admin",now,"e")).toThrow("Completion requires");const done=applyCommand(d,{...c,state:"Completed",output:"private/output.mp4",checks:"Playback reviewed"},"admin",now,"e");expect(done.tasks[0].state).toBe("Completed");});
 it("requires handover scope and preserves source request",()=>{let d=configured();d=applyCommand(d,{action:"configure",agentId:"halley",responsibility:"QA",brand:"F365",workspace:"Editorial"},"admin",now,"c2");d=applyCommand(d,task,"admin",now,"t");const next=applyCommand(d,{action:"handover",taskId:"t",owner:"halley",completed:"Draft",files:"draft.mp4",issues:"Review",nextAction:"Check playback"},"admin",now,"h");expect(next.tasks[0]).toMatchObject({owner:"halley",source:"request-1",state:"Paused"});expect(next.history.at(-1)?.details).toMatchObject({nextAction:"Check playback"});});
 it("deduplicates approvals without activating the agent",()=>{const c:Command={action:"approval",agentId:"bob",reason:"Review setup"};const d=applyCommand(configured(),c,"admin",now,"a");expect(()=>applyCommand(d,c,"admin",now,"b")).toThrow("already");expect(d.agents[0].approved).toBe(false);});
});
