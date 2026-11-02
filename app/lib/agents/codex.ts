import { access } from "node:fs/promises";
import { spawn } from "node:child_process";

const bundled = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex";

export function codexQueueArgs(thread: string, note: string) {
  return ["queue", "--thread", thread, "--message", note];
}

export function redactCodexError(text: string) {
  return text.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\s+/g, " ").trim().slice(0, 300);
}

export async function codexBinary() {
  const fromEnv = process.env.CODEX_BIN?.trim();
  if (fromEnv) return fromEnv;
  try {
    await access(bundled);
    return bundled;
  } catch {
    return null;
  }
}

export async function queueCodexMessage(thread: string, note: string) {
  const bin = await codexBinary();
  if (!bin) throw new Error("Codex is not available on this server. The session can be saved here. Send from the machine where ChatGPT Codex is signed in.");
  const stderr = await new Promise<string>((resolve, reject) => {
    const child = spawn(bin, codexQueueArgs(thread, note), { stdio: ["ignore", "ignore", "pipe"], timeout: 20000 });
    let err = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
      if (err.length > 4000) err = err.slice(0, 4000);
    });
    child.on("error", () => reject(new Error("Codex could not be started on this server.")));
    child.on("close", (code) => {
      if (code === 0) resolve("");
      else reject(new Error(redactCodexError(err) || "Codex did not accept the message."));
    });
  });
  return stderr;
}
