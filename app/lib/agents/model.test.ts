import { describe,it,expect } from "vitest";
import { applyCommand,characterBrief,initialData,commandSchema,type Command } from "./model";
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
 it("stores a Codex session without starting the agent or dropping approval",()=>{
   let d=applyCommand(configured(),{action:"approval",agentId:"bob",reason:"Review"},"admin",now,"request");
   d=applyCommand(d,{action:"decision",requestId:"request",decision:"approve",note:"Reviewed configuration"},"admin",now,"decision");
   d=applyCommand(d,{action:"link",agentId:"bob",thread:"11111111-1111-4111-8111-111111111111"},"admin",now,"link");
   expect(d.agents[0]).toMatchObject({approved:true,state:"Paused",codexThread:"11111111-1111-4111-8111-111111111111"});
   d=applyCommand(d,{action:"configure",agentId:"bob",responsibility:"Updated role",brand:"F365",workspace:"Editorial"},"admin",now,"edit");
   expect(d.agents[0]).toMatchObject({approved:false,state:"Paused",codexThread:"11111111-1111-4111-8111-111111111111"});
 });
 it("rejects a Codex session id that is not a name or UUID",()=>{expect(commandSchema.safeParse({action:"link",agentId:"bob",thread:"../secret"}).success).toBe(false);expect(commandSchema.safeParse({action:"link",agentId:"bob",thread:"Bob"}).success).toBe(true);});
 it("queues a Codex note without marking the agent as working",()=>{
   let d=applyCommand(configured(),{action:"approval",agentId:"bob",reason:"Review"},"admin",now,"request");
   d=applyCommand(d,{action:"decision",requestId:"request",decision:"approve",note:"Reviewed configuration"},"admin",now,"decision");
   d=applyCommand(d,task,"admin",now,"t");
   expect(()=>applyCommand(d,{action:"message",taskId:"t",note:"Draft the rundown"},"admin",now,"m")).toThrow("Save a Codex session");
   d=applyCommand(d,{action:"link",agentId:"bob",thread:"Bob"},"admin",now,"link");
   const next=applyCommand(d,{action:"message",taskId:"t",note:"Draft the rundown"},"admin",now,"m");
   expect(next.agents[0].state).toBe("Paused");
   expect(next.tasks[0]).toMatchObject({state:"Waiting for Input",messages:[{at:now,thread:"Bob",note:"Draft the rundown"}]});
   expect(()=>applyCommand(next,{action:"transition",taskId:"t",state:"Working",note:"start",output:"",checks:"",issues:""},"admin",now,"e")).toThrow("paused");
 });
 it("shows an admin line and a character reply without leaving pause",()=>{
   const d=applyCommand(initialData(),{action:"talk",agentId:"fiddle",note:"What should the rundown cover?"},"admin",now,"talk");
   expect(d.agents.find(a=>a.id==="fiddle")).toMatchObject({state:"Paused",dialogue:[{at:now,from:"admin",text:"What should the rundown cover?"}]});
   const next=applyCommand(d,{action:"reply",agentId:"fiddle",note:"Two sourced stories, then a closer."},"admin",now,"reply");
   expect(next.agents.find(a=>a.id==="fiddle")?.state).toBe("Paused");
   expect(next.agents.find(a=>a.id==="fiddle")?.dialogue[1]).toMatchObject({from:"agent",text:"Two sourced stories, then a closer."});
   const brief=characterBrief(next.agents.find(a=>a.id==="fiddle")!);
   expect(brief.system).toContain("Fiddle");
   expect(brief.system).toContain("Professional video editor");
   expect(brief.system).toContain("learned production craft");
   expect(brief.system).toContain("/workspace/library?type=background");
   expect(brief.user).toContain("What should the rundown cover?");
 });
 it("refuses to message an unapproved agent",()=>{
   let d=applyCommand(configured(),task,"admin",now,"t");
   d=applyCommand(d,{action:"link",agentId:"bob",thread:"Bob"},"admin",now,"link");
   expect(()=>applyCommand(d,{action:"message",taskId:"t",note:"Draft the rundown"},"admin",now,"m")).toThrow("Approve");
 });
});
