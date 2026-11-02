import { z } from "zod";

export const roles = [
  ["bob", "Bob", "Professional video editor and designer", "Production"],
  ["fiddle", "Fiddle", "Professional video editor and designer", "Production"],
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
  z.object({ action: z.literal("link"), agentId: id, thread: z.string().trim().max(80).refine((value) => value === "" || /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(value), "Use a session UUID or exact session name.") }),
  z.object({ action: z.literal("message"), taskId: text, note: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("talk"), agentId: id, note: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("reply"), agentId: id, note: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("automation"), owner: id, title: text, trigger: text, schedule: text, brand: text, workspace: text, tools: text, costLimit: z.number().finite().min(0), approvalPolicy: text }),
]);
export type Command = z.infer<typeof commandSchema>;
export type DialogueLine = { at: string; from: "admin" | "agent"; text: string };
export type Agent = { id: string; name: string; responsibility: string; group: string; state: "Paused"; brand: string; workspace: string; approved: boolean; codexThread: string; dialogue: DialogueLine[] };
export type CodexNote = { at: string; thread: string; note: string };
export type Task = { id: string; owner: string; title: string; source: string; brand: string; workspace: string; priority: string; state: typeof states[number]; createdAt: string; updatedAt: string; output?: string; checks?: string; issues?: string; messages: CodexNote[] };
export type Event = { id: string; at: string; actor: string; action: string; subject: string; details: Record<string, unknown> };
export type Automation = Extract<Command, {action:"automation"}> & { id: string; state: "Paused"; createdAt: string; runHistory: unknown[] };
export type Data = { version: number; agents: Agent[]; tasks: Task[]; automations: Automation[]; requests: { id: string; agentId: string; reason: string; state: "Waiting for Admin" | "Completed" | "Cancelled"; createdAt: string }[]; history: Event[] };
export function initialData(): Data {
  return { version: 0, agents: roles.map(([id,name,responsibility,group]) => ({ id,name,responsibility,group,state:"Paused",brand:"",workspace:"",approved:false,codexThread:"",dialogue:[] })), tasks:[], automations:[], requests:[], history:[] };
}
const terminal = (state: string) => ["Completed", "Cancelled", "Failed"].includes(state);
export function present(data: Data): Data {
  return {
    ...data,
    agents: data.agents.map((agent) => ({ ...agent, codexThread: agent.codexThread ?? "", dialogue: agent.dialogue ?? [] })),
    tasks: data.tasks.map((task) => ({ ...task, messages: task.messages ?? [] })),
  };
}
export function dispatchThread(data: Data, taskId: string) {
  const current = present(data);
  const task = current.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error("Task not found.");
  if (terminal(task.state)) throw new Error("This task is closed. Create a new task for further work.");
  const agent = current.agents.find((item) => item.id === task.owner);
  if (!agent?.codexThread) throw new Error("Save a Codex session for this agent before sending.");
  if (!agent.approved) throw new Error("Approve this agent's configuration before sending.");
  return agent.codexThread;
}
const editorStandard = " Your learned production craft is the judgement of a senior sports-video editor. Take stories only from https://planetsport.studio/workspace/articles. New stories arrive every day: prefer the new intake. Remember the image and brand used with each article. Do not lead with an article again unless the new story refers back to it, such as as TEAMtalk reported. Take media only from the platform: backgrounds at /workspace/library?type=background, audio at /workspace/library?type=audio, images at /workspace/library?type=image and /workspace/images, presenters at /workspace/library?type=presenter, and logos and colours at /brand-kits. Picture: the Empty Studio video is the moving background; remove the green from each presenter clip and time about five action clips per presenter for talking, listening and reacting. Mouths do not need to match the words. Story: three sourced articles, each 45–60 seconds of speech shared by the two presenters; a thin article stays short. Captions are the spoken words and finish each line. Sound: natural pace, pauses, a laugh, a sigh or a thoughtful reaction; music stays low and plays only under the intro and outro. Motion: bring the story image forward, then return to the studio and the presenters, using the brand transition between stories when it fits. Finish one playable 1920×1080 file. Do not publish it.";
export function characterBrief(agent: Agent) {
  const recent = agent.dialogue.slice(-8).map((line) => `${line.from === "admin" ? "Admin" : agent.name}: ${line.text}`).join("\n");
  const scope = agent.brand && agent.workspace ? `${agent.brand} / ${agent.workspace}` : "no brand or workspace assigned";
  const editing = agent.id === "bob" || agent.id === "fiddle" ? editorStandard : "";
  return {
    system: `You are ${agent.name}, a Plexa ${agent.group.toLowerCase()} character. Your responsibility is ${agent.responsibility}.${editing} Your scope is ${scope}. Speak in the first person as ${agent.name}, in a few plain sentences. You are on screen for a conversation. You have not changed files, published a video, or started a job. Production characters cannot change code, databases, infrastructure, security, or permissions.`,
    user: recent || "Introduce yourself in one sentence.",
  };
}
export function applyCommand(data: Data, command: Command, actor: string, now: string, uid: string): Data {
  const d = present(structuredClone(data));
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
    d.tasks.push({ ...command, id:uid, state:"Paused", createdAt:now, updatedAt:now, messages:[] });
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
  } else if (command.action === "link") {
    const agent = d.agents.find(a => a.id === command.agentId)!;
    agent.codexThread = command.thread;
    subject = agent.id;
  } else if (command.action === "message") {
    const task = d.tasks.find(t => t.id === command.taskId);
    if (!task) throw new Error("Task not found.");
    if (terminal(task.state)) throw new Error("This task is closed. Create a new task for further work.");
    const agent = d.agents.find(a => a.id === task.owner);
    if (!agent?.codexThread) throw new Error("Save a Codex session for this agent before sending.");
    if (!agent.approved) throw new Error("Approve this agent's configuration before sending.");
    task.messages.push({ at: now, thread: agent.codexThread, note: command.note });
    task.state = "Waiting for Input";
    task.updatedAt = now;
    subject = task.id;
  } else if (command.action === "talk" || command.action === "reply") {
    const agent = d.agents.find(a => a.id === command.agentId)!;
    agent.dialogue.push({ at: now, from: command.action === "talk" ? "admin" : "agent", text: command.note });
    subject = agent.id;
  } else {
    scoped(command.owner, command.brand, command.workspace);
    if (d.automations.some(a => a.title.toLowerCase() === command.title.toLowerCase() && a.brand === command.brand && a.workspace === command.workspace)) throw new Error("This automation already exists.");
    d.automations.push({ ...command, id:uid, state:"Paused", createdAt:now, runHistory:[] });
  }
  d.version++;
  d.history.push({ id:uid, at:now, actor, action:command.action, subject, details:{ ...command } });
  return d;
}
