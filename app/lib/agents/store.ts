import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { shouldUseNetlifyBlobStore } from "@/app/lib/netlify-blob-json";
import { projectRoot } from "@/app/lib/paths";
import { initialData, applyCommand, type Data, type Command } from "./model";
const file = path.join(projectRoot(), "data/local/plexa-agent-management.json");
const key = "management.json";
const store = () => getStore({ name:"plexa-agent-management", consistency:"strong" });
export class Conflict extends Error {}
export async function readAgents(): Promise<Data> {
  if (shouldUseNetlifyBlobStore()) return (await store().get(key, {type:"json"})) ?? initialData();
  try { return JSON.parse(await fs.readFile(file,"utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return initialData(); throw e; }
}
export async function updateAgents(command: Command, version: number, actor: string) {
  const now = new Date().toISOString(), uid = randomUUID();
  if (shouldUseNetlifyBlobStore()) {
    const s = store();
    const current = await s.getWithMetadata(key, {type:"json"});
    const data: Data = current?.data ?? initialData();
    if (data.version !== version) throw new Conflict("Another Admin saved changes. Refresh before saving.");
    const next = applyCommand(data, command, actor, now, uid);
    if (current && !current.etag) throw new Error("Storage version unavailable; changes were not saved.");
    const result = await s.setJSON(key, next, current ? {onlyIfMatch:current.etag!} : {onlyIfNew:true});
    if (!result.modified) throw new Conflict("Another Admin saved changes. Refresh before saving.");
    return next;
  }
  await fs.mkdir(path.dirname(file), {recursive:true});
  let lock;
  try { lock = await fs.open(`${file}.lock`, "wx"); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Conflict("A save is in progress. Try again."); throw e; }
  try {
    const data = await readAgents();
    if (data.version !== version) throw new Conflict("Another Admin saved changes. Refresh before saving.");
    const next = applyCommand(data,command,actor,now,uid);
    const temp = `${file}.${uid}.tmp`;
    await fs.writeFile(temp,JSON.stringify(next,null,2),{mode:0o600});
    await fs.rename(temp,file);
    return next;
  } finally { await lock.close(); await fs.unlink(`${file}.lock`); }
}
