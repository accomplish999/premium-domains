import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { test } from "node:test";
import { parseEuropeanThousands, parseMoney, parseParkStamp } from "../src/domain";
import { parseDynadotCsv } from "../src/sources/dynadot";
import { parseGodaddyJson } from "../src/sources/godaddy";
import { parseParkAuctions, parseParkDomains } from "../src/sources/parkio";
import { parseSedoAuctions, parseSedoTop } from "../src/sources/sedo";
import { fileLinks, parseInventory } from "../src/sources/download-index";
import { unzipFirst } from "../src/text";
import { dedupe } from "../src/dedupe";

test("park.io close stamp is day-month with an EDT offset", () => {
  assert.equal(parseParkStamp("2026-07-10EDT11:00:00000"), "2026-10-07T15:00:00.000Z");
});

test("park.io auction and dropping records", () => {
  const auctions = parseParkAuctions({
    auctions: [{ name: "Jellyfin.co", price: "99", close_date: "2026-07-10EDT12:41:01000" }],
  });
  assert.equal(auctions.fetched, 1);
  assert.equal(auctions.listings[0]?.domain, "jellyfin.co");
  assert.equal(auctions.listings[0]?.price, 99);
  assert.equal(auctions.listings[0]?.auctionEnd, "2026-10-07T16:41:01.000Z");
  const dropping = parseParkDomains({ domains: [{ name: "baidu.co", date_available: "2026-10-08" }] }, "dropping");
  assert.equal(dropping.listings[0]?.auctionEnd, "2026-10-08T00:00:00.000Z");
  assert.equal(dropping.listings[0]?.listingType, "dropping");
});

test("dynadot csv uses the bid and the end timestamp", () => {
  const text = [
    "Domain,Bid Price,Bid Price Currency,Bids,End Time,End Timestamp,Links,Age, Appraisal, Appraisal Currency",
    "xoly.ai,$101,USD,15,2026/10/11 22:17 PST,1791782224112,19,2,$4097,USD",
  ].join("\n");
  const parsed = parseDynadotCsv(text, "auction");
  assert.equal(parsed.fetched, 1);
  assert.equal(parsed.listings[0]?.domain, "xoly.ai");
  assert.equal(parsed.listings[0]?.price, 101);
  assert.equal(parsed.listings[0]?.currency, "USD");
  assert.equal(parsed.listings[0]?.auctionEnd, new Date(1791782224112).toISOString());
});

test("godaddy json price and end time", () => {
  const text = JSON.stringify({
    data: [
      {
        domainName: "SHOP.IO",
        link: "https://www.godaddy.com/domain-auctions/shop-io-1",
        auctionType: "Bid",
        auctionEndTime: "2026-10-13T16:01:00Z",
        price: "$1,324",
      },
    ],
  });
  const parsed = parseGodaddyJson(text, "auction");
  assert.equal(parsed.listings[0]?.domain, "shop.io");
  assert.equal(parsed.listings[0]?.price, 1324);
  assert.equal(parsed.listings[0]?.auctionEnd, "2026-10-13T16:01:00.000Z");
  assert.equal(parsed.listings[0]?.listingType, "auction");
});

test("sedo auction lines and top-list thousands", () => {
  const auctions = parseSedoAuctions("winfox.com;1790844429;1791449229;30;$US;1;\n");
  assert.equal(auctions.listings[0]?.price, 30);
  assert.equal(auctions.listings[0]?.currency, "USD");
  assert.equal(auctions.listings[0]?.auctionEnd, new Date(1791449229 * 1000).toISOString());
  assert.deepEqual(parseEuropeanThousands("54.000 EUR"), { amount: 54000, currency: "EUR" });
  const top = parseSedoTop("university.net~200.000 EUR~\nhogs.com~Make offer~\n");
  assert.equal(top.listings[0]?.price, 200000);
  assert.equal(top.listings[0]?.currency, "EUR");
  assert.equal(top.listings[1]?.price, null);
});

test("money parser", () => {
  assert.equal(parseMoney("$1,324")?.amount, 1324);
  assert.equal(parseMoney("Make offer"), null);
  assert.equal(parseMoney(12)?.amount, 12);
});

test("namejet download index ignores the format switch and keeps file links", () => {
  const html = '<a href="/download.action?format=csv">CSV</a><a href="/files/expiring.csv">list</a>';
  assert.deepEqual(fileLinks(html, "https://www.namejet.com/download.action"), [
    "https://www.namejet.com/files/expiring.csv",
  ]);
  const parsed = parseInventory("domain,price\nmaze.co,15\n", "namejet", (domain) => `https://example.test/${domain}`);
  assert.equal(parsed.listings[0]?.domain, "maze.co");
  assert.equal(parsed.listings[0]?.price, 15);
});

test("zip reader inflates the first file", () => {
  const payload = Buffer.from("shop.io,1\n");
  const compressed = deflateRawSync(payload);
  const name = Buffer.from("list.csv");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(payload.length, 22);
  header.writeUInt16LE(name.length, 26);
  const zip = Buffer.concat([header, name, compressed]);
  assert.equal(unzipFirst(zip).toString("utf8"), "shop.io,1\n");
});

test("dedupe keeps one row and records the other source", () => {
  const rows = dedupe([
    {
      domain: "maze.co",
      source: "sedo",
      price: null,
      currency: null,
      auctionEnd: null,
      link: "https://sedo.example/maze.co",
      listingType: "marketplace",
    },
    {
      domain: "maze.co",
      source: "dynadot",
      price: 20,
      currency: "USD",
      auctionEnd: "2026-10-08T00:00:00.000Z",
      link: "https://dynadot.example/maze.co",
      listingType: "auction",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.source, "dynadot");
  assert.deepEqual(rows[0]?.alsoSeenOn, ["sedo"]);
});
