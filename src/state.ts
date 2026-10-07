import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Valuation } from "./types";

interface StateFile {
  domains: string[];
  ranAt: string | null;
}

interface CacheFile {
  entries: Record<string, { auction: number; marketplace: number; brokerage: number; at: string }>;
}

export function readState(file: string): Set<string> {
  if (!existsSync(file)) return new Set();
  const parsed = JSON.parse(readFileSync(file, "utf8")) as StateFile;
  return new Set((parsed.domains ?? []).map((domain) => domain.toLowerCase()));
}

export function writeState(file: string, domains: string[], ranAt: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const body: StateFile = { domains: [...domains].sort(), ranAt };
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
}

export interface CachedValuation extends Valuation {
  at: string;
}

export function readCache(file: string, maxAgeMs: number, now: number): Map<string, CachedValuation> {
  const map = new Map<string, CachedValuation>();
  if (!existsSync(file)) return map;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as CacheFile;
  for (const [domain, entry] of Object.entries(parsed.entries ?? {})) {
    const at = Date.parse(entry.at);
    if (Number.isNaN(at) || now - at > maxAgeMs) continue;
    map.set(domain.toLowerCase(), {
      domain: domain.toLowerCase(),
      auction: entry.auction,
      marketplace: entry.marketplace,
      brokerage: entry.brokerage,
      at: entry.at,
    });
  }
  return map;
}

export function writeCache(file: string, values: Map<string, CachedValuation>): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const entries: CacheFile["entries"] = {};
  for (const [domain, value] of values) {
    entries[domain] = {
      auction: value.auction,
      marketplace: value.marketplace,
      brokerage: value.brokerage,
      at: value.at,
    };
  }
  writeFileSync(file, `${JSON.stringify({ entries }, null, 2)}\n`);
}
