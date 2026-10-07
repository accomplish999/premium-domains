import { parseMoney, splitDomain } from "../domain";
import { explainStatus, request } from "../http";
import { keepDomain } from "../filter";
import { cell, headerIndex, parseCsv } from "../text";
import type { Listing } from "../types";
import type { SourceAdapter, SourceContext, SourceLoad } from "./types";

export function parseAfternicCsv(text: string): { listings: Listing[]; fetched: number } {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) return { listings: [], fetched: 0 };
  const index = headerIndex(header);
  const listings: Listing[] = [];
  let fetched = 0;
  for (const row of rows.slice(1)) {
    const domain = cell(row, index, ["domain", "domain name", "name"]).toLowerCase();
    if (!splitDomain(domain)) continue;
    fetched++;
    const money = parseMoney(cell(row, index, ["price", "buy now", "buynow", "buy now price"]));
    listings.push({
      domain,
      source: "afternic",
      price: money?.amount ?? null,
      currency: money ? (money.currency ?? "USD") : null,
      auctionEnd: null,
      link: `https://www.afternic.com/domain/${encodeURIComponent(domain)}`,
      listingType: "marketplace",
    });
  }
  return { listings, fetched };
}

export const afternic: SourceAdapter = {
  id: "afternic",
  label: "Afternic",
  blurb: "No public catalog. Off unless AFTERNIC_FEED_URL points at a CSV you are allowed to read.",
  defaultEnabled: false,
  keyEnv: ["AFTERNIC_FEED_URL"],
  async load(ctx: SourceContext): Promise<SourceLoad> {
    const url = ctx.env.AFTERNIC_FEED_URL?.trim();
    if (!url) {
      return {
        listings: [],
        fetched: 0,
        skipped: true,
        warnings: [
          {
            code: "AFTERNIC_NO_FEED",
            severity: "note",
            message:
              "Afternic does not publish a public catalog. Discovery goes through GoDaddy. Set AFTERNIC_FEED_URL to a CSV export you are allowed to read, or leave this source off.",
          },
        ],
      };
    }
    const response = await request(url, ctx.fetch, { timeoutMs: 120_000 });
    if (response.status !== 200) {
      throw new Error(`Afternic feed ${explainStatus(response.status, response.text)}`);
    }
    const parsed = parseAfternicCsv(response.text);
    return {
      listings: parsed.listings.filter((listing) => keepDomain(listing.domain, ctx.filter)),
      fetched: parsed.fetched,
      warnings: [],
      skipped: false,
    };
  },
};
