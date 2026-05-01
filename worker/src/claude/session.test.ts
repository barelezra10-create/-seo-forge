import { describe, it, expect } from "vitest";
import { runClaudeOneShot } from "./session";

const SKIP_REAL = process.env.RUN_REAL_CLAUDE !== "1";

describe("runClaudeOneShot", () => {
  it.skipIf(SKIP_REAL)("returns a response from the claude CLI", async () => {
    const result = await runClaudeOneShot({
      prompt: "Reply with exactly the word 'PONG' and nothing else.",
      timeoutMs: 60_000,
    });
    expect(result.text.trim().toUpperCase()).toContain("PONG");
    expect(result.exitCode).toBe(0);
  });

  it("times out when claude blocks", async () => {
    await expect(
      runClaudeOneShot({
        prompt: "test",
        timeoutMs: 100,
        binPath: "sleep",
        binArgs: ["10"],
      }),
    ).rejects.toThrow(/timed out/i);
  });

  it("rejects when binary is missing", async () => {
    await expect(
      runClaudeOneShot({
        prompt: "test",
        timeoutMs: 5000,
        binPath: "/nonexistent-binary-xyz",
      }),
    ).rejects.toThrow();
  });
});
