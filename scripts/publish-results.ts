import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import prettier from "prettier";
import {
  dateFromGeneratedAt,
  mergeArchive,
  withHistoryDate,
  type ArchiveFile,
  type HistoryIndex,
  type PublishedFile,
} from "../src/archive";
import { repoRoot } from "../src/words";

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

async function writeJson(file: string, value: unknown, config: prettier.Options | null): Promise<void> {
  mkdirSync(path.dirname(file), { recursive: true });
  const raw = `${JSON.stringify(value, null, 2)}\n`;
  const formatted = await prettier.format(raw, { ...config, parser: "json" });
  writeFileSync(file, formatted);
}

export async function publishResults(webFile: string, root = repoRoot()): Promise<void> {
  const today = readJson<PublishedFile>(webFile);
  const stats = today.stats;
  if (!today.generatedAt || !Array.isArray(today.rows) || !stats || stats.valued < 1 || stats.truncated) {
    throw new Error("refusing to publish an incomplete results file");
  }
  const date = dateFromGeneratedAt(today.generatedAt);
  const dataDir = path.join(root, "data");
  const historyDir = path.join(dataDir, "history");
  const resultsFile = path.join(dataDir, "results.json");
  const webOut = path.join(root, "web", "results.json");
  const archiveFile = path.join(dataDir, "archive.json");
  const indexFile = path.join(historyDir, "index.json");
  const previous = existsSync(archiveFile) ? readJson<ArchiveFile>(archiveFile) : null;
  const index = existsSync(indexFile) ? readJson<HistoryIndex>(indexFile) : { dates: [] };
  const config = await prettier.resolveConfig(resultsFile);
  await writeJson(resultsFile, today, config);
  await writeJson(webOut, today, config);
  await writeJson(path.join(historyDir, `${date}.json`), today, config);
  await writeJson(indexFile, withHistoryDate(index, date), config);
  await writeJson(archiveFile, mergeArchive(previous, today), config);
}

if (process.argv[1] && process.argv[1].endsWith("publish-results.ts")) {
  publishResults(process.argv[2] ?? "results/web-results.json").catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  });
}
