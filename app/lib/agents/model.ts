import { z } from "zod";

export const roles = [
  ["bob", "Bob", "Video Production", "Production"],
  ["fiddle", "Fiddle", "Content, Research and Editorial Preparation", "Production"],
  ["james", "James", "Application Development", "Engineering"],
  ["hubble", "Hubble", "Systems and Rendering", "Engineering"],
  ["linnaeus", "Linnaeus", "Automations and Integrations", "Engineering"],
  ["banach", "Banach", "Databases and Data Reliability", "Engineering"],
  ["halley", "Halley", "Testing and Quality Assurance", "Engineering"],
  ["huygens", "Huygens", "Infrastructure and Deployment", "Engineering"],
] as const;
export const states = ["Queued", "Working", "Waiting for Input", "Waiting for Admin", "Waiting for Engineering", "Paused", "Completed", "Failed", "Cancelled"] as const;
const text = z.string().trim().min(1).max(2000);
const id = z.enum(["bob", "fiddle", "james", "hubble", "linnaeus", "banach", "halley", "huygens"]);
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("configure"), agentId: id, responsibility: text, brand: text, workspace: text }),
  z.object({ action: z.literal("task"), owner: id, title: text, source: text, brand: text, workspace: text, priority: z.enum(["Low", "Normal", "High", "Urgent"]) }),
  z.object({ action: z.literal("transition"), taskId: text, state: z.enum(states), note: text, output: z.string().max(2000), checks: z.string().max(2000), issues: z.string().max(2000) }),
  z.object({ action: z.literal("handover"), taskId: text, owner: id, completed: text, files: text, issues: text, nextAction: text }),
  z.object({ action: z.literal("decision"), requestId: text, decision: z.enum(["approve", "reject"]), note: text }),
  z.object({ action: z.literal("approval"), agentId: id, reason: text }),
  z.object({ action: z.literal("automation"), owner: id, title: text, trigger: text, schedule: text, brand: text, workspace: text, tools: text, costLimit: z.number().finite().min(0), approvalPolicy: text }),
]);
export type Command = z.infer<typeof commandSchema>;
export type Agent = { id: string; name: string; responsibility: string; group: string; state: "Paused"; brand: string; workspace: string; approved: boolean };
export type Task = { id: string; owner: string; title: string; source: string; brand: string; workspace: string; priority: string; state: typeof states[number]; createdAt: string; updatedAt: string; output?: string; checks?: string; issues?: string };
export type Event = { id: string; at: string; actor: string; action: string; subject: string; details: Record<string, unknown> };
export type Automation = Extract<Command, {action:"automation"}> & { id: string; state: "Paused"; createdAt: string; runHistory: unknown[] };
export type Data = { version: number; agents: Agent[]; tasks: Task[]; automations: Automation[]; requests: { id: string; agentId: string; reason: string; state: "Waiting for Admin" | "Completed" | "Cancelled"; createdAt: string }[]; history: Event[] };
export function initialData(): Data {
  return { version: 0, agents: roles.map(([id,name,responsibility,group]) => ({ id,name,responsibility,group,state:"Paused",brand:"",workspace:"",approved:false })), tasks:[], automations:[], requests:[], history:[] };
}
const terminal = (state: string) => ["Completed", "Cancelled", "Failed"].includes(state);
export function applyCommand(data: Data, command: Command, actor: string, now: string, uid: string): Data {
  const d = structuredClone(data);
  const scoped = (owner: string, brand: string, workspace: string) => {
    const agent = d.agents.find(a => a.id === owner);
    if (!agent || agent.brand !== brand || agent.workspace !== workspace || !brand || !workspace) throw new Error("Configure the agent for this brand and workspace first.");
    return agent;
  };
  let subject = uid;
  if (command.action === "configure") {
    const agent = d.agents.find(a => a.id === command.agentId)!;
    if (d.tasks.some(t => t.owner === agent.id && !terminal(t.state)) || d.automations.some(a => a.owner === agent.id)) throw new Error("Resolve assigned tasks and automations before changing scope.");
    Object.assign(agent, { responsibility: command.responsibility, brand: command.brand, workspace: command.workspace, approved:false });
    subject = agent.id;
  } else if (command.action === "task") {
    scoped(command.owner, command.brand, command.workspace);
    if (d.tasks.some(t => !terminal(t.state) && t.brand === command.brand && t.workspace === command.workspace && (t.title.toLowerCase() === command.title.toLowerCase() || t.source === command.source))) throw new Error("An open task already covers this request in this workspace.");
    d.tasks.push({ ...command, id:uid, state:"Paused", createdAt:now, updatedAt:now });
  } else if (command.action === "transition" || command.action === "handover") {
    const task = d.tasks.find(t => t.id === command.taskId);
    if (!task) throw new Error("Task not found.");
    if (terminal(task.state)) throw new Error("This task is closed. Create a new task for further work.");
    subject = task.id;
    if (command.action === "handover") {
      scoped(command.owner, task.brand, task.workspace);
      task.owner = command.owner;
      task.state = "Paused";
    } else {
      if (command.state === "Working") throw new Error("Agent execution is paused pending approval and an approved runner.");
      if (command.state === "Completed" && (!command.output.trim() || !command.checks.trim())) throw new Error("Completion requires an output location and recorded quality checks.");
      Object.assign(task, { state:command.state, output:command.output, checks:command.checks, issues:command.issues });
    }
    task.updatedAt = now;
  } else if (command.action === "approval") {
    if (d.requests.some(r => r.agentId === command.agentId && r.state === "Waiting for Admin")) throw new Error("An approval request is already waiting for this agent.");
    d.requests.push({ id:uid, agentId:command.agentId, reason:command.reason, state:"Waiting for Admin", createdAt:now });
  } else if (command.action === "decision") {
    const request = d.requests.find(r => r.id === command.requestId);
    if (!request || request.state !== "Waiting for Admin") throw new Error("No pending approval request found.");
    const agent = d.agents.find(a => a.id === request.agentId)!;
    if (command.decision === "approve" && (!agent.brand || !agent.workspace)) throw new Error("Configure brand and workspace before approving configuration.");
    agent.approved = command.decision === "approve";
    request.state = command.decision === "approve" ? "Completed" : "Cancelled";
    subject = request.id;
  } else {
    scoped(command.owner, command.brand, command.workspace);
    if (d.automations.some(a => a.title.toLowerCase() === command.title.toLowerCase() && a.brand === command.brand && a.workspace === command.workspace)) throw new Error("This automation already exists.");
    d.automations.push({ ...command, id:uid, state:"Paused", createdAt:now, runHistory:[] });
  }
  d.version++;
  d.history.push({ id:uid, at:now, actor, action:command.action, subject, details:{ ...command } });
  return d;
}
