import { dateOnly, parseMoney, parseParkStamp, splitDomain } from "../domain";
import { delay, explainStatus, request } from "../http";
import { keepParkDomain } from "../filter";
import type { Listing, Warning } from "../types";
import type { SourceAdapter, SourceContext, SourceLoad } from "./types";

const AUCTIONS = "https://park.io/auctions.json";
const PAUSE_MS = 200;
const MAX_PAGES = 100;

const DROP_FALLBACK = [
  "ac",
  "ag",
  "ai",
  "bz",
  "co",
  "com",
  "gg",
  "info",
  "io",
  "je",
  "lc",
  "ly",
  "me",
  "mn",
  "net",
  "org",
  "pro",
  "red",
  "sc",
  "sh",
  "to",
  "us",
  "vc",
];

interface ParkAuction {
  id?: string;
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

export function parkTldsFromHtml(html: string, section: "domains" | "premium-domains"): string[] {
  const found = new Set<string>();
  const pattern = new RegExp(`/${section}/index/([a-z0-9]+)`, "g");
  for (const match of html.matchAll(pattern)) {
    const tld = match[1];
    if (!tld || tld === "page" || tld === "sort") continue;
    found.add(tld);
  }
  return [...found].sort();
}

export function parseParkAuctions(body: ParkPage): { listings: Listing[]; fetched: number } {
  const auctions = body.auctions ?? [];
  const listings: Listing[] = [];
  for (const auction of auctions) {
    const name = auction.name?.trim().toLowerCase();
    if (!name) continue;
    const money = parseMoney(auction.price ?? null);
    const id = auction.id?.trim();
    listings.push({
      domain: name,
      source: "parkio",
      price: money?.amount ?? null,
      currency: money?.currency ?? (money ? "USD" : null),
      auctionEnd: auction.close_date ? parseParkStamp(auction.close_date) : null,
      link: id ? `https://park.io/auctions/view/${encodeURIComponent(id)}` : "https://park.io/auctions",
      listingType: "auction",
    });
  }
  return { listings, fetched: auctions.length };
}

export function parseParkDomains(body: ParkPage): { listings: Listing[]; fetched: number } {
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
      link: `https://park.io/domains/view/${encodeURIComponent(name)}`,
      listingType: "drop",
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
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await request(url, ctx.fetch, { timeoutMs: 45_000 });
    if (response.status !== 200) {
      throw new Error(`park.io ${explainStatus(response.status, response.text)}`);
    }
    const body = JSON.parse(response.text) as ParkPage;
    if (body.success === false) throw new Error("park.io returned success false.");
    const parsed = take(body);
    fetched += parsed.fetched;
    for (const listing of parsed.listings) {
      if (keepParkDomain(listing.domain) && splitDomain(listing.domain)) listings.push(listing);
    }
    const pageCount = body.pageCount ?? page;
    if (!body.nextPage || page >= pageCount) break;
    const next = (body.page ?? page) + 1;
    if (next <= page) break;
    await delay(PAUSE_MS);
    url = pageUrl(next);
  }
  return { listings, fetched };
}

async function tldsFor(
  pageUrl: string,
  section: "domains" | "premium-domains",
  fallback: string[],
  ctx: SourceContext,
): Promise<string[]> {
  const found = new Set(fallback);
  try {
    const response = await request(pageUrl, ctx.fetch, { timeoutMs: 45_000 });
    if (response.status === 200) {
      for (const tld of parkTldsFromHtml(response.text, section)) found.add(tld);
    }
  } catch {
    return [...found].sort();
  }
  return [...found].sort();
}

async function loadQuiet(
  firstUrl: string,
  pageUrl: (page: number) => string,
  ctx: SourceContext,
  take: (body: ParkPage) => { listings: Listing[]; fetched: number },
  warnings: Warning[],
  label: string,
): Promise<{ listings: Listing[]; fetched: number }> {
  try {
    return await loadPages(firstUrl, pageUrl, ctx, take);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push({ code: "PARKIO_PARTIAL", severity: "note", message: `${label}: ${message}` });
    return { listings: [], fetched: 0 };
  }
}

export const parkio: SourceAdapter = {
  id: "parkio",
  label: "park.io",
  blurb:
    "Public JSON for live auctions and the full upcoming-drop lists, including premium drops, for every TLD park.io publishes.",
  defaultEnabled: true,
  keyEnv: [],
  async load(ctx: SourceContext): Promise<SourceLoad> {
    const warnings: Warning[] = [];
    const listings: Listing[] = [];
    let fetched = 0;
    const auctions = await loadQuiet(
      AUCTIONS,
      (page) => `https://park.io/auctions/index/page:${page}.json`,
      ctx,
      (body) => parseParkAuctions(body),
      warnings,
      "auctions",
    );
    listings.push(...auctions.listings);
    fetched += auctions.fetched;

    const dropTlds = await tldsFor("https://park.io/domains", "domains", DROP_FALLBACK, ctx);
    for (const tld of dropTlds) {
      await delay(PAUSE_MS);
      const dropping = await loadQuiet(
        `https://park.io/domains/index/${tld}.json?limit=1000`,
        (page) => `https://park.io/domains/index/${tld}/page:${page}.json?limit=1000`,
        ctx,
        (body) => parseParkDomains(body),
        warnings,
        `drops ${tld}`,
      );
      listings.push(...dropping.listings);
      fetched += dropping.fetched;
    }

    const premiumTlds = await tldsFor("https://park.io/premium-domains", "premium-domains", DROP_FALLBACK, ctx);
    for (const tld of premiumTlds) {
      await delay(PAUSE_MS);
      const premium = await loadQuiet(
        `https://park.io/premium-domains/index/${tld}.json?limit=1000`,
        (page) => `https://park.io/premium-domains/index/${tld}/page:${page}.json?limit=1000`,
        ctx,
        (body) => parseParkDomains(body),
        warnings,
        `premium drops ${tld}`,
      );
      listings.push(...premium.listings);
      fetched += premium.fetched;
    }

    if (fetched === 0) {
      throw new Error(warnings[0]?.message ?? "park.io returned no listings.");
    }
    return { listings, fetched, warnings, skipped: false };
  },
};
