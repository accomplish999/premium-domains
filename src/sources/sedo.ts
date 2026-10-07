import { countTld, parseEuropeanThousands, parseMoney, parseUnix, splitDomain } from "../domain";
import { explainStatus, request } from "../http";
import { keepDomain } from "../filter";
import type { Listing, Warning } from "../types";
import type { SourceAdapter, SourceContext, SourceLoad } from "./types";

const AUCTIONS = "https://sedo.com/txt/auctions_us.txt";
const TOPS = [
  "https://sedo.com/txt/topdomains_us.txt",
  "https://sedo.com/txt/topdomains_d.txt",
  "https://sedo.com/txt/topdomains_e.txt",
  "https://sedo.com/txt/topdomains_fr.txt",
  "https://sedo.com/txt/topdomains_es.txt",
];

export function parseSedoAuctions(text: string): { listings: Listing[]; fetched: number } {
  const listings: Listing[] = [];
  let fetched = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(";");
    const domain = (parts[0] ?? "").trim().toLowerCase();
    if (!domain || !domain.includes(".")) continue;
    fetched++;
    const end = parts[2] ? parseUnix(parts[2], "s") : null;
    const money = parseMoney(parts[3] ?? null);
    const currencyToken = (parts[4] ?? "").trim();
    const currency = /eur/i.test(currencyToken)
      ? "EUR"
      : /us|usd|\$/i.test(currencyToken)
        ? "USD"
        : (money?.currency ?? null);
    listings.push({
      domain,
      source: "sedo",
      price: money?.amount ?? null,
      currency,
      auctionEnd: end,
      link: `https://sedo.com/search/details/?domain=${encodeURIComponent(domain)}`,
      listingType: "auction",
    });
  }
  return { listings, fetched };
}

export function parseSedoTop(text: string): { listings: Listing[]; fetched: number } {
  const listings: Listing[] = [];
  let fetched = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("~");
    const domain = (parts[0] ?? "").trim().toLowerCase();
    if (!domain || !domain.includes(".")) continue;
    fetched++;
    const money = parseEuropeanThousands(parts[1] ?? "");
    listings.push({
      domain,
      source: "sedo",
      price: money?.amount ?? null,
      currency: money?.currency ?? null,
      auctionEnd: null,
      link: `https://sedo.com/search/details/?domain=${encodeURIComponent(domain)}`,
      listingType: "buynow",
    });
  }
  return { listings, fetched };
}

export const sedo: SourceAdapter = {
  id: "sedo",
  label: "Sedo",
  blurb:
    "Public partner text feeds. The auction file is one complete list, not a paged catalog. Locale top lists are included. Other locale auction files repeat the same rows.",
  defaultEnabled: true,
  keyEnv: [],
  async load(ctx: SourceContext): Promise<SourceLoad> {
    const warnings: Warning[] = [];
    const listings: Listing[] = [];
    const fetchedByTld: Record<string, number> = {};
    let fetched = 0;
    const auctions = await request(AUCTIONS, ctx.fetch, { timeoutMs: 60_000 });
    if (auctions.status !== 200 || !auctions.text.includes(";")) {
      throw new Error(`Sedo auctions feed ${explainStatus(auctions.status, auctions.text)}`);
    }
    const parsedAuctions = parseSedoAuctions(auctions.text);
    fetched += parsedAuctions.fetched;
    for (const url of TOPS) {
      const top = await request(url, ctx.fetch, { timeoutMs: 60_000 });
      if (top.status !== 200) {
        warnings.push({
          code: "SEDO_TOP_FAILED",
          severity: "note",
          message: `Sedo top list ${url} ${explainStatus(top.status, top.text)}`,
        });
        continue;
      }
      const parsedTop = parseSedoTop(top.text);
      fetched += parsedTop.fetched;
      parsedAuctions.listings.push(...parsedTop.listings);
    }
    for (const listing of parsedAuctions.listings) {
      countTld(fetchedByTld, listing.domain);
      if (splitDomain(listing.domain) && keepDomain(listing.domain, ctx.filter)) listings.push(listing);
    }
    return { listings, fetched, warnings, skipped: false, fetchedByTld };
  },
};
