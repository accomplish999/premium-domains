import { parseMoney, parseUnix, splitDomain } from "../domain";
import { explainStatus, request } from "../http";
import { keepDomain } from "../filter";
import { cell, headerIndex, parseCsv } from "../text";
import type { Listing, ListingType, Warning } from "../types";
import type { SourceAdapter, SourceContext, SourceLoad } from "./types";

const FEEDS: Array<{ url: string; listingType: ListingType }> = [
  {
    url: "https://www.dynadot.com/market/auction/auctions.csv?currency=USD",
    listingType: "auction",
  },
  {
    url: "https://www.dynadot.com/market/user-auction/user_auctions.csv?currency=USD",
    listingType: "auction",
  },
  {
    url: "https://www.dynadot.com/market/pre-expiry-auction/pre_expiry_auctions.csv?currency=USD",
    listingType: "auction",
  },
];

export function parseDynadotCsv(text: string, listingType: ListingType): { listings: Listing[]; fetched: number } {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) return { listings: [], fetched: 0 };
  const index = headerIndex(header);
  const listings: Listing[] = [];
  let fetched = 0;
  for (const row of rows.slice(1)) {
    const domain = cell(row, index, ["domain", "domain name"]).toLowerCase();
    if (!domain) continue;
    fetched++;
    const money = parseMoney(cell(row, index, ["bid price", "price"]));
    const currency = cell(row, index, ["bid price currency", "currency"]) || money?.currency || null;
    const stamp = cell(row, index, ["end timestamp"]);
    const auctionEnd = stamp ? parseUnix(stamp, "ms") : null;
    listings.push({
      domain,
      source: "dynadot",
      price: money?.amount ?? null,
      currency: currency ? currency.replace("$", "").toUpperCase() || "USD" : money ? "USD" : null,
      auctionEnd,
      link: `https://www.dynadot.com/market/auction/${encodeURIComponent(domain)}`,
      listingType,
    });
  }
  return { listings, fetched };
}

export const dynadot: SourceAdapter = {
  id: "dynadot",
  label: "Dynadot",
  blurb: "Public aftermarket CSV for expired auctions, user auctions, and pre-expiry auctions.",
  defaultEnabled: true,
  keyEnv: [],
  async load(ctx: SourceContext): Promise<SourceLoad> {
    const listings: Listing[] = [];
    const warnings: Warning[] = [];
    let fetched = 0;
    const failures: string[] = [];
    for (const feed of FEEDS) {
      const response = await request(feed.url, ctx.fetch, { timeoutMs: 180_000 });
      const looksCsv =
        response.status === 200 && /domain/i.test(response.text.slice(0, 400)) && response.text.includes(",");
      if (!looksCsv) {
        failures.push(explainStatus(response.status, response.text));
        continue;
      }
      const parsed = parseDynadotCsv(response.text, feed.listingType);
      fetched += parsed.fetched;
      for (const listing of parsed.listings) {
        if (splitDomain(listing.domain) && keepDomain(listing.domain, ctx.filter)) listings.push(listing);
      }
    }
    if (listings.length === 0 && failures.length === FEEDS.length) {
      throw new Error(`Dynadot CSV feeds failed. ${failures[0] ?? ""}`.trim());
    }
    if (failures.length > 0) {
      warnings.push({
        code: "DYNADOT_PARTIAL",
        severity: "note",
        message: `${failures.length} Dynadot file(s) were not CSV. ${failures[0]}`,
      });
    }
    return { listings, fetched, warnings, skipped: false };
  },
};
