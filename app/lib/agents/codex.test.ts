import { describe, expect, it } from "vitest";
import { codexQueueArgs, redactCodexError } from "./codex";

describe("Codex queue command", () => {
  it("passes the session and message as separate arguments", () => {
    expect(codexQueueArgs("Bob", "Draft the rundown")).toEqual(["queue", "--thread", "Bob", "--message", "Draft the rundown"]);
  });
  it("removes credential-shaped text from a Codex error", () => {
    expect(redactCodexError("failed Bearer sk-testsecret\nnext")).toBe("failed Bearer [redacted] next");
  });
});
