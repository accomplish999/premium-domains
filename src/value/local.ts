import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const LOCAL_TIMEOUT_MS = 70 * 60 * 1000;

export function localModelScript(): string | null {
  const candidates = [
    path.resolve(__dirname, "../../model/humbleworth/value.py"),
    path.resolve(__dirname, "../../../model/humbleworth/value.py"),
    path.resolve(process.cwd(), "model/humbleworth/value.py"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export async function valueLocal(
  domains: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
  const script = localModelScript();
  if (!script) return { ok: false, error: "The local HumbleWorth script is not installed." };
  const python = env.PYTHON?.trim() || "python3";
  return await new Promise((resolve) => {
    const child = spawn(python, [script], {
      env: { ...process.env, ...env, PYTHONUNBUFFERED: "1", TOKENIZERS_PARALLELISM: "false" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, LOCAL_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
      process.stderr.write(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim().split("\n").at(-1);
        resolve({ ok: false, error: detail || `Local HumbleWorth exited ${code}.` });
        return;
      }
      try {
        resolve({ ok: true, body: JSON.parse(Buffer.concat(stdout).toString("utf8")) as unknown });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        resolve({ ok: false, error: message });
      }
    });
    child.stdin.end(JSON.stringify({ domains }));
  });
}
