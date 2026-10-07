import type { ValuedListing } from "./types";

export interface PublishedFile {
  generatedAt: string;
  threshold: number;
  rows: ValuedListing[];
  stats?: {
    fetched: number;
    kept: number;
    valued: number;
    above: number;
    highestMarketplace: number | null;
    truncated: boolean;
  };
}

export interface ArchiveRow extends ValuedListing {
  firstSeen: string;
  lastSeen: string;
  active: boolean;
  sightings: number;
}

export interface ArchiveFile {
  generatedAt: string;
  threshold: number;
  rows: ArchiveRow[];
}

export interface HistoryIndex {
  dates: string[];
}

export function dateFromGeneratedAt(generatedAt: string): string {
  const date = generatedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("generatedAt needs an ISO date.");
  return date;
}

export function withHistoryDate(index: HistoryIndex, date: string): HistoryIndex {
  const dates = [...new Set([...index.dates, date])].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return { dates };
}

export function mergeArchive(previous: ArchiveFile | null, today: PublishedFile): ArchiveFile {
  const date = dateFromGeneratedAt(today.generatedAt);
  const prior = new Map((previous?.rows ?? []).map((row) => [row.domain, row]));
  const seen = new Set<string>();
  const rows: ArchiveRow[] = [];
  for (const row of today.rows) {
    seen.add(row.domain);
    const old = prior.get(row.domain);
    if (!old) {
      rows.push({ ...row, firstSeen: date, lastSeen: date, active: true, sightings: 1 });
      continue;
    }
    const sameDay = old.lastSeen === date;
    rows.push({
      domain: row.domain,
      source: row.source,
      price: row.price,
      currency: row.currency,
      auctionEnd: row.auctionEnd,
      link: row.link,
      listingType: row.listingType,
      marketplace: row.marketplace,
      auctionValue: row.auctionValue,
      brokerage: row.brokerage,
      alsoSeenOn: row.alsoSeenOn,
      firstSeen: old.firstSeen,
      lastSeen: date,
      active: true,
      sightings: sameDay ? old.sightings : old.sightings + 1,
    });
  }
  for (const old of prior.values()) {
    if (seen.has(old.domain)) continue;
    rows.push({ ...old, active: false });
  }
  rows.sort((a, b) => b.marketplace - a.marketplace || a.domain.localeCompare(b.domain));
  return { generatedAt: today.generatedAt, threshold: today.threshold, rows };
}
