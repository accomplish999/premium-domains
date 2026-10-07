import { dateOnly, parseMoney, parseParkStamp, splitDomain } from "../domain";
import { delay, explainStatus, request } from "../http";
import { keepDomain } from "../filter";
import type { Listing, ListingType, Warning } from "../types";
import type { SourceAdapter, SourceContext, SourceLoad } from "./types";

const AUCTIONS = "https://park.io/auctions.json";
const PAUSE_MS = 200;

interface ParkAuction {
  name?: string;
  price?: string;
  close_date?: string;
}

interface ParkDomain {
  name?: string;
  date_available?: string;
}

interface ParkPage {
  success?: boolean;
  nextPage?: boolean;
  page?: number;
  pageCount?: number;
  auctions?: ParkAuction[];
  domains?: ParkDomain[];
}

export function parseParkAuctions(body: ParkPage): { listings: Listing[]; fetched: number } {
  const auctions = body.auctions ?? [];
  const listings: Listing[] = [];
  for (const auction of auctions) {
    const name = auction.name?.trim().toLowerCase();
    if (!name) continue;
    const money = parseMoney(auction.price ?? null);
    listings.push({
      domain: name,
      source: "parkio",
      price: money?.amount ?? null,
      currency: money?.currency ?? (money ? "USD" : null),
      auctionEnd: auction.close_date ? parseParkStamp(auction.close_date) : null,
      link: `https://park.io/auctions`,
      listingType: "auction",
    });
  }
  return { listings, fetched: auctions.length };
}

export function parseParkDomains(body: ParkPage, listingType: ListingType): { listings: Listing[]; fetched: number } {
  const domains = body.domains ?? [];
  const listings: Listing[] = [];
  for (const item of domains) {
    const name = item.name?.trim().toLowerCase();
    if (!name) continue;
    listings.push({
      domain: name,
      source: "parkio",
      price: null,
      currency: null,
      auctionEnd: item.date_available ? dateOnly(item.date_available) : null,
      link: listingType === "marketplace" ? "https://park.io/premium-domains" : "https://park.io/domains",
      listingType,
    });
  }
  return { listings, fetched: domains.length };
}

async function loadPages(
  firstUrl: string,
  pageUrl: (page: number) => string,
  ctx: SourceContext,
  take: (body: ParkPage) => { listings: Listing[]; fetched: number },
): Promise<{ listings: Listing[]; fetched: number }> {
  const listings: Listing[] = [];
  let fetched = 0;
  let url = firstUrl;
  for (let page = 1; page <= 80; page++) {
    const response = await request(url, ctx.fetch, { timeoutMs: 45_000 });
    if (response.status !== 200) {
      throw new Error(`park.io ${explainStatus(response.status, response.text)}`);
    }
    const body = JSON.parse(response.text) as ParkPage;
    if (body.success === false) throw new Error("park.io returned success false.");
    const parsed = take(body);
    fetched += parsed.fetched;
    for (const listing of parsed.listings) {
      if (keepDomain(listing.domain, ctx.filter) && splitDomain(listing.domain)) listings.push(listing);
    }
    if (!body.nextPage) break;
    const next = (body.page ?? page) + 1;
    await delay(PAUSE_MS);
    url = pageUrl(next);
  }
  return { listings, fetched };
}

export const parkio: SourceAdapter = {
  id: "parkio",
  label: "park.io",
  blurb: "Public JSON for current auctions, dropping names, and the premium list.",
  defaultEnabled: true,
  keyEnv: [],
  async load(ctx: SourceContext): Promise<SourceLoad> {
    const warnings: Warning[] = [];
    const auctions = await loadPages(
      AUCTIONS,
      (page) => `https://park.io/auctions/index/page:${page}.json`,
      ctx,
      (body) => parseParkAuctions(body),
    );
    const listings = [...auctions.listings];
    let fetched = auctions.fetched;
    const tlds = [...ctx.filter.tlds];
    for (const tld of tlds) {
      await delay(PAUSE_MS);
      const dropping = await loadPages(
        `https://park.io/domains/index/${tld}.json?limit=1000`,
        (page) => `https://park.io/domains/index/${tld}/page:${page}.json?limit=1000`,
        ctx,
        (body) => parseParkDomains(body, "dropping"),
      );
      listings.push(...dropping.listings);
      fetched += dropping.fetched;
    }
    await delay(PAUSE_MS);
    const premium = await loadPages(
      "https://park.io/premium-domains.json?limit=1000",
      (page) => `https://park.io/premium-domains/index/page:${page}.json?limit=1000`,
      ctx,
      (body) => parseParkDomains(body, "marketplace"),
    );
    listings.push(...premium.listings);
    fetched += premium.fetched;
    return { listings, fetched, warnings, skipped: false };
  },
};
