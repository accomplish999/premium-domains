import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { candidateRank, compareRank, keepListing, type FilterOptions } from "./filter";
import { dedupe } from "./dedupe";
import { readCache, readState, writeCache, writeState, type CachedValuation } from "./state";
import { resolveSources } from "./sources/registry";
import type { SourceAdapter } from "./sources/types";
import type { Envelope, Listing, ScanResult, SourceReport, Valuation, ValuedListing, Warning } from "./types";
import { valueDomains } from "./value/humbleworth";
import { formatCsv } from "./format";
import type { FetchLike } from "./http";
import type { WordLists } from "./words";

export interface ScanOptions {
  threshold: number;
  tlds: string[];
  minLength: number;
  maxLength: number;
  maxValues: number;
  sources: string[] | null;
  outDir: string | null;
  statePath: string;
  cachePath: string;
  cacheDays: number;
  fetch: FetchLike;
  now: Date;
  words: WordLists;
  env: NodeJS.ProcessEnv;
  listings?: Listing[];
  values?: Map<string, Valuation>;
  adapters?: SourceAdapter[];
}

export async function scan(options: ScanOptions): Promise<Envelope> {
  const warnings: Warning[] = [];
  const filter: FilterOptions = {
    tlds: new Set(options.tlds),
    minLength: options.minLength,
    maxLength: options.maxLength,
    words: options.words,
  };
  const adapters = options.adapters ?? resolveSources(options.sources);
  const reports: SourceReport[] = [];
  const listings: Listing[] = [];

  if (options.listings) {
    reports.push({
      id: "fixture",
      enabled: true,
      ok: true,
      skipped: false,
      fetched: options.listings.length,
      kept: options.listings.filter((listing) => keepListing(listing, filter)).length,
      valued: 0,
      above: 0,
    });
    listings.push(...options.listings.filter((listing) => keepListing(listing, filter)));
  } else {
    for (const adapter of adapters) {
      try {
        const loaded = await adapter.load({ fetch: options.fetch, env: options.env, filter, now: options.now });
        warnings.push(...loaded.warnings);
        const kept = loaded.listings.filter((listing) => keepListing(listing, filter));
        listings.push(...kept);
        reports.push({
          id: adapter.id,
          enabled: true,
          ok: true,
          skipped: loaded.skipped,
          fetched: loaded.fetched,
          kept: kept.length,
          valued: 0,
          above: 0,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push({ code: "SOURCE_FAILED", severity: "loud", message: `${adapter.id}: ${message}` });
        reports.push({
          id: adapter.id,
          enabled: true,
          ok: false,
          skipped: false,
          fetched: 0,
          kept: 0,
          valued: 0,
          above: 0,
          error: message,
        });
      }
    }
  }

  const deduped = dedupe(listings);
  deduped.sort((a, b) => compareRank(candidateRank(a.domain, options.words), candidateRank(b.domain, options.words)));
  const truncated = deduped.length > options.maxValues;
  const queue = deduped.slice(0, options.maxValues);
  if (truncated) {
    warnings.push({
      code: "CANDIDATES_TRUNCATED",
      severity: "note",
      message: `${deduped.length} names passed the prefilter. Valuation covers the first ${options.maxValues}, shortest and .com first. Raise --max-values to value more.`,
    });
  }

  const cache = options.values
    ? new Map<string, CachedValuation>()
    : readCache(options.cachePath, options.cacheDays * 86_400_000, options.now.getTime());
  const missing: string[] = [];
  for (const listing of queue) {
    const hit = options.values?.get(listing.domain) ?? cache.get(listing.domain);
    if (!hit) missing.push(listing.domain);
  }

  let valuedOk = true;
  if (!options.values && missing.length > 0) {
    try {
      const fresh = await valueDomains(missing, options.fetch, options.env);
      const at = options.now.toISOString();
      for (const value of fresh) {
        cache.set(value.domain, { ...value, at });
      }
    } catch (err) {
      valuedOk = false;
      const message = err instanceof Error ? err.message : String(err);
      warnings.push({ code: "HUMBLEWORTH_UNAVAILABLE", severity: "loud", message });
    }
  } else if (options.values) {
    for (const value of options.values.values()) {
      cache.set(value.domain, { ...value, at: options.now.toISOString() });
    }
  }

  const rows: ValuedListing[] = [];
  const parkioValued: ValuedListing[] = [];
  let highest: number | null = null;
  let valued = 0;
  if (valuedOk) {
    for (const listing of queue) {
      const value = cache.get(listing.domain);
      if (!value) continue;
      valued++;
      const report = reports.find((item) => item.id === listing.source);
      if (report) report.valued += 1;
      if (highest === null || value.marketplace > highest) highest = value.marketplace;
      const valuedRow: ValuedListing = {
        domain: listing.domain,
        source: listing.source,
        price: listing.price,
        currency: listing.currency,
        auctionEnd: listing.auctionEnd,
        link: listing.link,
        listingType: listing.listingType,
        marketplace: value.marketplace,
        auctionValue: value.auction,
        brokerage: value.brokerage,
        alsoSeenOn: listing.alsoSeenOn,
      };
      if (listing.source === "parkio") parkioValued.push(valuedRow);
      if (value.marketplace <= options.threshold) continue;
      if (report) report.above += 1;
      rows.push(valuedRow);
    }
  }
  rows.sort((a, b) => b.marketplace - a.marketplace || a.domain.localeCompare(b.domain));
  parkioValued.sort((a, b) => b.marketplace - a.marketplace || a.domain.localeCompare(b.domain));

  const previous = readState(options.statePath);
  const newRows = rows.filter((row) => !previous.has(row.domain));
  const generatedAt = options.now.toISOString();
  const result: ScanResult = {
    generatedAt,
    threshold: options.threshold,
    rows,
    newRows,
    sources: reports,
    stats: {
      fetched: reports.reduce((sum, report) => sum + report.fetched, 0),
      kept: deduped.length,
      valued,
      above: rows.length,
      highestMarketplace: highest,
      truncated,
    },
  };

  const envelope: Envelope = {
    ok: valuedOk,
    tool: "scan",
    warnings,
    result: valuedOk
      ? result
      : { ...result, rows: [], newRows: [], stats: { ...result.stats, above: 0, highestMarketplace: null } },
  };
  if (valuedOk) {
    writeState(
      options.statePath,
      rows.map((row) => row.domain),
      generatedAt,
    );
    if (!options.values) writeCache(options.cachePath, cache);
  }
  if (options.outDir) {
    writeOutputs(options.outDir, envelope, new Set(newRows.map((row) => row.domain)));
    writeFileSync(path.join(options.outDir, "parkio-valued.json"), `${JSON.stringify(parkioValued, null, 2)}\n`);
  }
  return envelope;
}

export function writeOutputs(dir: string, envelope: Envelope, fresh: Set<string>): void {
  mkdirSync(dir, { recursive: true });
  const result = envelope.result && "rows" in envelope.result ? envelope.result : null;
  writeFileSync(path.join(dir, "latest.json"), `${JSON.stringify(envelope, null, 2)}\n`);
  if (!result) return;
  writeFileSync(path.join(dir, "latest.csv"), formatCsv(result.rows, fresh));
  writeFileSync(path.join(dir, "new.csv"), formatCsv(result.newRows, fresh));
  const web = {
    generatedAt: result.generatedAt,
    threshold: result.threshold,
    rows: result.rows,
    stats: result.stats,
  };
  writeFileSync(path.join(dir, "web-results.json"), `${JSON.stringify(web, null, 2)}\n`);
}
