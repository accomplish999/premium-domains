import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
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

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function publishResults(webFile: string, root = repoRoot()): void {
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
  writeJson(resultsFile, today);
  writeJson(webOut, today);
  writeJson(path.join(historyDir, `${date}.json`), today);
  writeJson(indexFile, withHistoryDate(index, date));
  writeJson(archiveFile, mergeArchive(previous, today));
}

if (process.argv[1] && process.argv[1].endsWith("publish-results.ts")) {
  try {
    publishResults(process.argv[2] ?? "results/web-results.json");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }
}
