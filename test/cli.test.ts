import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { main } from "../src/cli";
import { scan } from "../src/run";
import { loadWords } from "../src/words";
import type { Listing } from "../src/types";

const listings: Listing[] = [
  {
    domain: "cedar.co",
    source: "dynadot",
    price: 12,
    currency: "USD",
    auctionEnd: "2026-10-11T00:00:00.000Z",
    link: "https://www.dynadot.com/market/auction/cedar.co",
    listingType: "auction",
  },
  {
    domain: "pebble.co",
    source: "sedo",
    price: 40,
    currency: "USD",
    auctionEnd: null,
    link: "https://sedo.com/search/details/?domain=pebble.co",
    listingType: "buynow",
  },
  {
    domain: "blue-gas.com",
    source: "godaddy",
    price: 1,
    currency: "USD",
    auctionEnd: null,
    link: "https://auctions.godaddy.com/",
    listingType: "auction",
  },
];

const values = {
  "cedar.co": { domain: "cedar.co", auction: 9000, marketplace: 83000, brokerage: 120000 },
  "pebble.co": { domain: "pebble.co", auction: 40, marketplace: 310, brokerage: 700 },
};

test("help and version", async () => {
  const help = await main(["help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /premium-domains/);
  assert.match(help.stdout, /--json/);
  assert.equal(help.stderr, "");
  const version = await main(["--version"]);
  assert.equal(version.code, 0);
  assert.match(version.stdout, /0\.1\.0/);
});

test("fixture scan keeps only the name above the floor", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "premium-"));
  const listFile = path.join(dir, "listings.json");
  const valueFile = path.join(dir, "values.json");
  const { writeFileSync, readFileSync } = await import("node:fs");
  writeFileSync(listFile, JSON.stringify(listings));
  writeFileSync(valueFile, JSON.stringify(values));
  const result = await main([
    "scan",
    "--listings",
    listFile,
    "--values",
    valueFile,
    "--json",
    "--out",
    dir,
    "--state",
    path.join(dir, "state.json"),
    "--threshold",
    "25000",
  ]);
  assert.equal(result.code, 0);
  const body = JSON.parse(result.stdout) as {
    ok: boolean;
    tool: string;
    result: { rows: Array<{ domain: string; marketplace: number }>; newRows: Array<{ domain: string }> };
  };
  assert.equal(body.ok, true);
  assert.equal(body.tool, "scan");
  assert.deepEqual(
    body.result.rows.map((row) => row.domain),
    ["cedar.co"],
  );
  assert.equal(body.result.rows[0]?.marketplace, 83000);
  assert.equal(body.result.newRows.length, 1);
  const csv = readFileSync(path.join(dir, "latest.csv"), "utf8");
  assert.match(csv, /cedar\.co/);
  assert.doesNotMatch(csv, /pebble\.co/);
  const again = await main([
    "scan",
    "--listings",
    listFile,
    "--values",
    valueFile,
    "--json",
    "--new",
    "--state",
    path.join(dir, "state.json"),
  ]);
  assert.equal(again.code, 0);
  const second = JSON.parse(again.stdout) as { result: { newRows: unknown[] } };
  assert.equal(second.result.newRows.length, 0);
});

test("replicate without a token is a loud HumbleWorth failure", async () => {
  const words = loadWords();
  const envelope = await scan({
    threshold: 25000,
    tlds: ["com", "co", "io", "ai"],
    minLength: 1,
    maxLength: 10,
    maxValues: 10,
    sources: [],
    outDir: null,
    statePath: "/tmp/premium-domains-no-state.json",
    cachePath: "/tmp/premium-domains-no-cache.json",
    cacheDays: 14,
    fetch: async () => {
      throw new Error("offline");
    },
    now: new Date("2026-10-07T00:00:00.000Z"),
    words,
    env: { HUMBLEWORTH_BACKEND: "replicate" },
    listings,
    adapters: [],
  });
  assert.equal(envelope.ok, false);
  assert.equal(envelope.result && "rows" in envelope.result ? envelope.result.rows.length : -1, 0);
  assert.ok(
    envelope.warnings.some((warning) => warning.code === "HUMBLEWORTH_UNAVAILABLE" && warning.severity === "loud"),
  );
});

test("unknown source is an input error", async () => {
  const result = await main(["scan", "--sources", "not-a-feed"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Unknown source/);
});

test("sources command names the key the DropCatch adapter reads", async () => {
  const result = await main(["sources"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /dropcatch/);
  assert.match(result.stdout, /DROPCATCH_CLIENT_ID/);
  assert.match(result.stdout, /afternic off/);
});
