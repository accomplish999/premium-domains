import { countTld, parseMoney } from "../domain";
import { delay, explainStatus, request } from "../http";
import { keepLetterDomain } from "../filter";
import type { Listing, ListingType, Warning } from "../types";
import type { SourceAdapter, SourceContext, SourceLoad } from "./types";

const PAUSE_MS = 400;
const MAX_PAGES = 130;

const FEEDS: Array<{ root: string; listingType: ListingType }> = [
  { root: "https://www.atom.com/premium-domains-for-sale", listingType: "buynow" },
  { root: "https://www.atom.com/ai-domains-for-sale", listingType: "buynow" },
  { root: "https://www.atom.com/ultra-premium-marketplace", listingType: "buynow" },
  { root: "https://www.atom.com/aged-domains", listingType: "buynow" },
  { root: "https://www.atom.com/aftermarket-domains", listingType: "buynow" },
  { root: "https://www.atom.com/expired-domains", listingType: "auction" },
];

const NAME_RE = /class="domain-name[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/g;

export function atomTotalPages(html: string): number {
  const match = html.match(/totalPages:\s*(\d+)/);
  const count = match ? Number(match[1]) : 1;
  if (!Number.isInteger(count) || count < 1) return 1;
  return count;
}

export function parseAtomListings(html: string, listingType: ListingType): { listings: Listing[]; fetched: number } {
  const listings: Listing[] = [];
  for (const match of html.matchAll(NAME_RE)) {
    const raw = match[1]?.trim() ?? "";
    const domain = raw.toLowerCase();
    if (!domain.includes(".")) continue;
    const window = html.slice(match.index ?? 0, (match.index ?? 0) + 500);
    const price = window.match(/class="domain-price[^"]*">\s*([^<]*?)\s*</);
    const money = parseMoney(price?.[1] ?? null);
    listings.push({
      domain,
      source: "atom",
      price: money?.amount ?? null,
      currency: money ? (money.currency ?? "USD") : null,
      auctionEnd: null,
      link: `https://www.atom.com/name/${encodeURIComponent(raw)}`,
      listingType,
    });
  }
  return { listings, fetched: listings.length };
}

function pageUrl(root: string, page: number): string {
  return page <= 1 ? root : `${root}/page/${page}`;
}

export const atom: SourceAdapter = {
  id: "atom",
  label: "Atom",
  blurb: "Public premium, .ai, ultra-premium, aged, aftermarket, and expired HTML listings. No key.",
  defaultEnabled: true,
  keyEnv: [],
  async load(ctx: SourceContext): Promise<SourceLoad> {
    const listings: Listing[] = [];
    const warnings: Warning[] = [];
    const fetchedByTld: Record<string, number> = {};
    let fetched = 0;
    const failures: string[] = [];
    for (const feed of FEEDS) {
      try {
        let previous = "";
        let first = await request(pageUrl(feed.root, 1), ctx.fetch, { timeoutMs: 60_000 });
        if (first.status !== 200 || !first.text.includes("domain-name")) {
          await delay(1500);
          first = await request(pageUrl(feed.root, 1), ctx.fetch, { timeoutMs: 60_000 });
        }
        if (first.status !== 200 || !first.text.includes("domain-name")) {
          failures.push(`${feed.root} ${explainStatus(first.status, first.text)}`);
          continue;
        }
        const total = Math.min(atomTotalPages(first.text), MAX_PAGES);
        let html = first.text;
        for (let page = 1; page <= total; page++) {
          if (page > 1) {
            await delay(PAUSE_MS);
            let response = await request(pageUrl(feed.root, page), ctx.fetch, { timeoutMs: 60_000 });
            for (let attempt = 0; attempt < 3 && (response.status === 503 || response.status === 429); attempt++) {
              await delay(2000 * (attempt + 1));
              response = await request(pageUrl(feed.root, page), ctx.fetch, { timeoutMs: 60_000 });
            }
            if (response.status !== 200) {
              if (response.status !== 400) {
                failures.push(`${feed.root} page ${page} ${explainStatus(response.status, response.text)}`);
              }
              break;
            }
            html = response.text;
          }
          const parsed = parseAtomListings(html, feed.listingType);
          if (parsed.listings.length === 0) break;
          const firstDomain = parsed.listings[0]?.domain ?? "";
          if (page > 1 && firstDomain && firstDomain === previous) break;
          previous = firstDomain;
          fetched += parsed.fetched;
          for (const listing of parsed.listings) {
            countTld(fetchedByTld, listing.domain);
            if (keepLetterDomain(listing.domain)) listings.push(listing);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${feed.root} ${message}`);
      }
    }
    if (fetched === 0 && failures.length > 0) {
      throw new Error(`Atom listings failed. ${failures[0] ?? ""}`.trim());
    }
    if (failures.length > 0) {
      warnings.push({
        code: "ATOM_PARTIAL",
        severity: "note",
        message: failures.slice(0, 4).join(" | "),
      });
    }
    return { listings, fetched, warnings, skipped: false, fetchedByTld };
  },
};
