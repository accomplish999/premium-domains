import { parseMoney, splitDomain } from "../domain";
import { explainStatus, request } from "../http";
import { keepDomain } from "../filter";
import { cell, headerIndex, jsonObjects, parseCsv, unzipFirst } from "../text";
import type { Listing, ListingType, Warning } from "../types";
import type { SourceAdapter, SourceContext, SourceLoad } from "./types";

const FILES = [
  "https://inventory.auctions.godaddy.com/expiring_service_no_adult_auctions.csv.zip",
  "https://inventory.auctions.godaddy.com/closeout_listings.json.zip",
];

interface GodaddyRow {
  domainName?: string;
  link?: string;
  auctionType?: string;
  auctionEndTime?: string;
  price?: string | number;
}

export function listingTypeFrom(raw: string | undefined, fallback: ListingType): ListingType {
  const text = (raw ?? "").toLowerCase();
  if (text.includes("close")) return "closeout";
  if (text.includes("buy") || text.includes("offer") || text.includes("bin")) return "buy_now";
  if (text.includes("bid") || text.includes("auction")) return "auction";
  return fallback;
}

export function parseGodaddyJson(text: string, fallback: ListingType): { listings: Listing[]; fetched: number } {
  const listings: Listing[] = [];
  let fetched = 0;
  for (const item of jsonObjects(text)) {
    if (!item || typeof item !== "object") continue;
    const row = item as GodaddyRow;
    const domain = row.domainName?.trim().toLowerCase();
    if (!domain) continue;
    fetched++;
    const money = parseMoney(row.price ?? null);
    listings.push({
      domain,
      source: "godaddy",
      price: money?.amount ?? null,
      currency: money ? (money.currency ?? "USD") : null,
      auctionEnd:
        row.auctionEndTime && !Number.isNaN(Date.parse(row.auctionEndTime))
          ? new Date(row.auctionEndTime).toISOString()
          : null,
      link: row.link || `https://auctions.godaddy.com/`,
      listingType: listingTypeFrom(row.auctionType, fallback),
    });
  }
  return { listings, fetched };
}

export function parseGodaddyCsv(text: string, fallback: ListingType): { listings: Listing[]; fetched: number } {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) return { listings: [], fetched: 0 };
  const index = headerIndex(header);
  if (!index.has("domain name") && !index.has("domain")) {
    throw new Error(`GoDaddy CSV header was not recognized: ${header.slice(0, 8).join(", ")}`);
  }
  const listings: Listing[] = [];
  let fetched = 0;
  for (const row of rows.slice(1)) {
    const domain = cell(row, index, ["domain name", "domain"]).toLowerCase();
    if (!domain) continue;
    fetched++;
    const money = parseMoney(cell(row, index, ["price", "bid price"]));
    const end = cell(row, index, ["auction end time", "end time"]);
    const type = cell(row, index, ["auction type", "type"]);
    const link = cell(row, index, ["link", "url"]);
    listings.push({
      domain,
      source: "godaddy",
      price: money?.amount ?? null,
      currency: money ? (money.currency ?? "USD") : null,
      auctionEnd: end && !Number.isNaN(Date.parse(end)) ? new Date(end).toISOString() : null,
      link: link || "https://auctions.godaddy.com/",
      listingType: listingTypeFrom(type, fallback),
    });
  }
  return { listings, fetched };
}

function decodeFeed(bytes: Buffer, url: string): { text: string; kind: "json" | "csv" } {
  const zip = url.endsWith(".zip") || (bytes.length > 2 && bytes[0] === 0x50 && bytes[1] === 0x4b);
  const raw = zip ? unzipFirst(bytes) : bytes;
  const text = raw.toString("utf8");
  if (url.includes(".json") || text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) {
    return { text, kind: "json" };
  }
  return { text, kind: "csv" };
}

export const godaddy: SourceAdapter = {
  id: "godaddy",
  label: "GoDaddy Auctions",
  blurb: "Public inventory files from inventory.auctions.godaddy.com. No key.",
  defaultEnabled: true,
  keyEnv: [],
  async load(ctx: SourceContext): Promise<SourceLoad> {
    const listings: Listing[] = [];
    const warnings: Warning[] = [];
    let fetched = 0;
    const failures: string[] = [];
    for (const url of FILES) {
      const response = await request(url, ctx.fetch, { timeoutMs: 180_000 });
      if (response.status !== 200) {
        failures.push(`${url} ${explainStatus(response.status, response.text)}`);
        continue;
      }
      const fallback: ListingType = url.includes("closeout") ? "closeout" : "auction";
      const decoded = decodeFeed(response.bytes, url);
      const parsed =
        decoded.kind === "json" ? parseGodaddyJson(decoded.text, fallback) : parseGodaddyCsv(decoded.text, fallback);
      fetched += parsed.fetched;
      for (const listing of parsed.listings) {
        if (splitDomain(listing.domain) && keepDomain(listing.domain, ctx.filter)) listings.push(listing);
      }
    }
    if (fetched === 0 && failures.length === FILES.length) {
      throw new Error(`GoDaddy inventory failed. ${failures[0] ?? ""}`.trim());
    }
    if (failures.length > 0) {
      warnings.push({
        code: "GODADDY_PARTIAL",
        severity: "note",
        message: failures[0] ?? "A GoDaddy inventory file failed.",
      });
    }
    return { listings, fetched, warnings, skipped: false };
  },
};
