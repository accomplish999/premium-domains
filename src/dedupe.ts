import type { Listing } from "./types";

export interface Deduped extends Listing {
  alsoSeenOn: string[];
}

export function dedupe(listings: Listing[]): Deduped[] {
  const groups = new Map<string, Listing[]>();
  for (const listing of listings) {
    const key = listing.domain.toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(listing);
    groups.set(key, list);
  }
  const rows: Deduped[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort(compareListing);
    const primary = sorted[0];
    if (!primary) continue;
    const seen = new Set<string>();
    const also: string[] = [];
    for (const listing of sorted) {
      if (listing.source === primary.source || seen.has(listing.source)) continue;
      seen.add(listing.source);
      also.push(listing.source);
    }
    rows.push({ ...primary, alsoSeenOn: also });
  }
  return rows;
}

function compareListing(a: Listing, b: Listing): number {
  const price = scorePrice(b) - scorePrice(a);
  if (price !== 0) return price;
  const end = scoreEnd(a) - scoreEnd(b);
  if (end !== 0) return end;
  return a.source.localeCompare(b.source);
}

function scorePrice(listing: Listing): number {
  return listing.price === null ? 0 : 1;
}

function scoreEnd(listing: Listing): number {
  if (!listing.auctionEnd) return Number.POSITIVE_INFINITY;
  const time = Date.parse(listing.auctionEnd);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
