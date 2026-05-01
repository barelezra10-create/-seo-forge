import { spawn } from "node:child_process";

export type ClaudeRunOptions = {
  prompt: string;
  timeoutMs?: number;
  binPath?: string;
  binArgs?: string[];
  cwd?: string;
  env?: Record<string, string>;
};

export type ClaudeRunResult = {
  text: string;
  exitCode: number;
  durationMs: number;
  stderr: string;
};

export async function runClaudeOneShot(opts: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const start = Date.now();
  const bin = opts.binPath ?? "claude";
  const args = opts.binArgs ?? ["-p", opts.prompt];

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? 30 * 60 * 1000);

    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`claude run timed out after ${opts.timeoutMs}ms`));
        return;
      }
      resolve({
        text: stdout,
        exitCode: code ?? -1,
        durationMs: Date.now() - start,
        stderr,
      });
    });
  });
}
