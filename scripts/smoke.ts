import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { main } from "../src/cli";

async function run(args: string[]): Promise<void> {
  const result = await main(args);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.code !== 0) {
    process.stdout.write(result.stdout);
    throw new Error(`exit ${result.code}: ${args.join(" ")}`);
  }
}

async function mainSmoke(): Promise<void> {
  await run(["--version"]);
  await run(["sources", "--json"]);
  const dir = mkdtempSync(path.join(tmpdir(), "premium-smoke-"));
  try {
    await run([
      "scan",
      "--listings",
      "examples/listings.json",
      "--values",
      "examples/values.json",
      "--json",
      "--out",
      dir,
      "--state",
      path.join(dir, "state.json"),
      "--cache",
      path.join(dir, "cache.json"),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("smoke ok");
}

mainSmoke().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
