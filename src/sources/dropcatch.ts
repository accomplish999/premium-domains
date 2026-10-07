import { parseMoney, splitDomain } from "../domain";
import { explainStatus, request } from "../http";
import { keepDomain } from "../filter";
import { cell, headerIndex, parseCsv, unzipFirst } from "../text";
import type { Listing } from "../types";
import type { SourceAdapter, SourceContext, SourceLoad } from "./types";

export function parseDropCatchCsv(text: string): { listings: Listing[]; fetched: number } {
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
    const money = parseMoney(cell(row, index, ["high bid", "price", "current bid", "bid"]));
    const end = cell(row, index, ["end time", "auction end", "enddate", "end date"]);
    listings.push({
      domain,
      source: "dropcatch",
      price: money?.amount ?? null,
      currency: money ? (money.currency ?? "USD") : null,
      auctionEnd: end && !Number.isNaN(Date.parse(end)) ? new Date(end).toISOString() : null,
      link: `https://www.dropcatch.com/domain/${encodeURIComponent(domain)}`,
      listingType: "auction",
    });
  }
  return { listings, fetched };
}

export const dropcatch: SourceAdapter = {
  id: "dropcatch",
  label: "DropCatch",
  blurb: "Official API. Needs DROPCATCH_CLIENT_ID and DROPCATCH_CLIENT_SECRET from the account API page.",
  defaultEnabled: true,
  keyEnv: ["DROPCATCH_CLIENT_ID", "DROPCATCH_CLIENT_SECRET"],
  async load(ctx: SourceContext): Promise<SourceLoad> {
    const clientId = ctx.env.DROPCATCH_CLIENT_ID?.trim();
    const clientSecret = ctx.env.DROPCATCH_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      return {
        listings: [],
        fetched: 0,
        skipped: true,
        warnings: [
          {
            code: "DROPCATCH_NO_KEY",
            severity: "note",
            message:
              "DropCatch is skipped. Set DROPCATCH_CLIENT_ID and DROPCATCH_CLIENT_SECRET to call the auction download API.",
          },
        ],
      };
    }
    const auth = await request("https://api.dropcatch.com/Authorize", ctx.fetch, {
      method: "POST",
      timeoutMs: 45_000,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ clientId, clientSecret, ClientId: clientId, ClientSecret: clientSecret }),
    });
    if (auth.status !== 200) {
      throw new Error(`DropCatch authorize ${explainStatus(auth.status, auth.text)}`);
    }
    const tokenBody = JSON.parse(auth.text) as { token?: string; Token?: string };
    const token = tokenBody.token ?? tokenBody.Token;
    if (!token) throw new Error("DropCatch authorize returned no token.");
    const file = await request("https://api.dropcatch.com/v2/downloads/auctions/AllAuctions?fileType=Csv", ctx.fetch, {
      timeoutMs: 180_000,
      headers: { authorization: `Bearer ${token}`, accept: "application/zip, application/octet-stream, text/csv" },
    });
    if (file.status !== 200) {
      throw new Error(`DropCatch auctions ${explainStatus(file.status, file.text)}`);
    }
    const zip = file.bytes[0] === 0x50 && file.bytes[1] === 0x4b;
    const text = zip ? unzipFirst(file.bytes).toString("utf8") : file.text;
    const parsed = parseDropCatchCsv(text);
    const listings = parsed.listings.filter((listing) => keepDomain(listing.domain, ctx.filter));
    return { listings, fetched: parsed.fetched, warnings: [], skipped: false };
  },
};
