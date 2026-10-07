import { parseMoney, splitDomain } from "../domain";
import { explainStatus, request } from "../http";
import { keepDomain } from "../filter";
import { cell, headerIndex, parseCsv, unzipFirst } from "../text";
import type { Listing } from "../types";
import type { SourceAdapter, SourceContext, SourceLoad } from "./types";

export function fileLinks(html: string, origin: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/href="([^"]+)"/gi)) {
    const href = match[1];
    if (!href) continue;
    const interesting = /\.(csv|txt|zip)(\?|$)/i.test(href) || /[?&](file|list|filetype)=/i.test(href);
    const bareFormat = /format=csv$/i.test(href) && !/[?&](file|list|type)=/i.test(href);
    if (!interesting || bareFormat) continue;
    found.add(href.startsWith("http") ? href : new URL(href, origin).toString());
  }
  return [...found];
}

export function parseInventory(
  text: string,
  source: string,
  linkFor: (domain: string) => string,
): { listings: Listing[]; fetched: number } {
  const trimmed = text.trim();
  if (!trimmed) return { listings: [], fetched: 0 };
  if (trimmed.includes(",") && /domain/i.test(trimmed.slice(0, 500))) {
    const rows = parseCsv(trimmed);
    const header = rows[0] ?? [];
    const index = headerIndex(header);
    const listings: Listing[] = [];
    let fetched = 0;
    for (const row of rows.slice(1)) {
      const domain = cell(row, index, ["domain name", "domain", "name"]).toLowerCase();
      if (!splitDomain(domain)) continue;
      fetched++;
      const money = parseMoney(cell(row, index, ["price", "bid", "min bid", "current bid"]));
      const end = cell(row, index, ["end time", "auction end", "close date", "available"]);
      listings.push({
        domain,
        source,
        price: money?.amount ?? null,
        currency: money ? (money.currency ?? "USD") : null,
        auctionEnd: end && !Number.isNaN(Date.parse(end)) ? new Date(end).toISOString() : null,
        link: linkFor(domain),
        listingType: "auction",
      });
    }
    return { listings, fetched };
  }
  const listings: Listing[] = [];
  let fetched = 0;
  for (const line of trimmed.split("\n")) {
    const token =
      line
        .trim()
        .split(/[\s,;|]+/)[0]
        ?.toLowerCase() ?? "";
    if (!splitDomain(token)) continue;
    fetched++;
    listings.push({
      domain: token,
      source,
      price: null,
      currency: null,
      auctionEnd: null,
      link: linkFor(token),
      listingType: "auction",
    });
  }
  return { listings, fetched };
}

export function downloadIndexAdapter(
  id: string,
  label: string,
  pageUrl: string,
  blurb: string,
  linkFor: (domain: string) => string,
): SourceAdapter {
  return {
    id,
    label,
    blurb,
    defaultEnabled: true,
    keyEnv: [],
    async load(ctx: SourceContext): Promise<SourceLoad> {
      const response = await request(pageUrl, ctx.fetch, { timeoutMs: 45_000 });
      const links = response.status === 200 ? fileLinks(response.text, pageUrl) : [];
      if (response.status !== 200 || links.length === 0) {
        const why =
          response.status === 200
            ? explainStatus(
                500,
                response.text.includes("500") || /incorrect/i.test(response.text)
                  ? response.text
                  : "no inventory files",
              )
            : explainStatus(response.status, response.text);
        throw new Error(`${label} ${why}`);
      }
      const listings: Listing[] = [];
      let fetched = 0;
      const failures: string[] = [];
      for (const link of links.slice(0, 12)) {
        const file = await request(link, ctx.fetch, { timeoutMs: 120_000 });
        if (file.status !== 200) {
          failures.push(explainStatus(file.status, file.text));
          continue;
        }
        const zip = link.endsWith(".zip") || (file.bytes[0] === 0x50 && file.bytes[1] === 0x4b);
        const text = zip ? unzipFirst(file.bytes).toString("utf8") : file.text;
        const parsed = parseInventory(text, id, linkFor);
        fetched += parsed.fetched;
        for (const listing of parsed.listings) {
          if (keepDomain(listing.domain, ctx.filter)) listings.push(listing);
        }
      }
      if (fetched === 0 && failures.length > 0) {
        throw new Error(`${label} file download failed. ${failures[0] ?? ""}`.trim());
      }
      return {
        listings,
        fetched,
        skipped: false,
        warnings:
          failures.length > 0
            ? [{ code: `${id.toUpperCase()}_PARTIAL`, severity: "note", message: failures[0] ?? "A file failed." }]
            : [],
      };
    },
  };
}
