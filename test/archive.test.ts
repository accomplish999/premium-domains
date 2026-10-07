import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeArchive, withHistoryDate, type ArchiveFile, type PublishedFile } from "../src/archive";
import type { ValuedListing } from "../src/types";

function row(overrides: Partial<ValuedListing> & Pick<ValuedListing, "domain" | "marketplace">): ValuedListing {
  return {
    source: "sedo",
    price: 10,
    currency: "USD",
    auctionEnd: null,
    link: `https://example.test/${overrides.domain}`,
    listingType: "buynow",
    auctionValue: 1,
    brokerage: 2,
    alsoSeenOn: [],
    ...overrides,
  };
}

function published(rows: ValuedListing[], generatedAt: string): PublishedFile {
  return { generatedAt, threshold: 25000, rows };
}

test("a new domain enters the archive", () => {
  const archive = mergeArchive(
    null,
    published([row({ domain: "cedar.co", marketplace: 40000 })], "2026-10-07T18:00:00.000Z"),
  );
  assert.equal(archive.rows.length, 1);
  assert.equal(archive.rows[0]?.firstSeen, "2026-10-07");
  assert.equal(archive.rows[0]?.lastSeen, "2026-10-07");
  assert.equal(archive.rows[0]?.active, true);
  assert.equal(archive.rows[0]?.sightings, 1);
  assert.equal(archive.rows[0]?.marketplace, 40000);
});

test("a domain seen again updates the latest price and link", () => {
  const first = mergeArchive(
    null,
    published([row({ domain: "cedar.co", marketplace: 40000, price: 10 })], "2026-10-07T18:00:00.000Z"),
  );
  const second = mergeArchive(
    first,
    published(
      [row({ domain: "cedar.co", marketplace: 51000, price: 80, link: "https://example.test/later" })],
      "2026-10-08T18:00:00.000Z",
    ),
  );
  assert.equal(second.rows.length, 1);
  assert.equal(second.rows[0]?.firstSeen, "2026-10-07");
  assert.equal(second.rows[0]?.lastSeen, "2026-10-08");
  assert.equal(second.rows[0]?.sightings, 2);
  assert.equal(second.rows[0]?.active, true);
  assert.equal(second.rows[0]?.marketplace, 51000);
  assert.equal(second.rows[0]?.price, 80);
  assert.equal(second.rows[0]?.link, "https://example.test/later");
});

test("a domain that drops out stays with active false", () => {
  const first = mergeArchive(
    null,
    published(
      [row({ domain: "cedar.co", marketplace: 40000 }), row({ domain: "pebble.co", marketplace: 30000, price: 4 })],
      "2026-10-07T18:00:00.000Z",
    ),
  );
  const second = mergeArchive(
    first,
    published([row({ domain: "cedar.co", marketplace: 41000 })], "2026-10-08T18:00:00.000Z"),
  );
  const gone = second.rows.find((item) => item.domain === "pebble.co");
  assert.ok(gone);
  assert.equal(gone?.active, false);
  assert.equal(gone?.sightings, 1);
  assert.equal(gone?.firstSeen, "2026-10-07");
  assert.equal(gone?.lastSeen, "2026-10-07");
  assert.equal(gone?.marketplace, 30000);
  assert.equal(gone?.price, 4);
  assert.equal(second.rows.find((item) => item.domain === "cedar.co")?.active, true);
});

test("the same day does not count a second sighting", () => {
  const first = mergeArchive(
    null,
    published([row({ domain: "cedar.co", marketplace: 40000 })], "2026-10-07T18:00:00.000Z"),
  );
  const again = mergeArchive(
    first,
    published([row({ domain: "cedar.co", marketplace: 42000, price: 15 })], "2026-10-07T22:00:00.000Z"),
  );
  assert.equal(again.rows[0]?.sightings, 1);
  assert.equal(again.rows[0]?.marketplace, 42000);
  assert.equal(again.rows[0]?.price, 15);
  assert.equal(again.generatedAt, "2026-10-07T22:00:00.000Z");
});

test("history dates stay newest first", () => {
  const index = withHistoryDate(withHistoryDate({ dates: [] }, "2026-10-07"), "2026-10-08");
  const same = withHistoryDate(index, "2026-10-08");
  assert.deepEqual(same.dates, ["2026-10-08", "2026-10-07"]);
});

test("archive rows are not removed when the previous file is the only record", () => {
  const previous: ArchiveFile = {
    generatedAt: "2026-10-01T00:00:00.000Z",
    threshold: 25000,
    rows: [
      {
        ...row({ domain: "amber.co", marketplace: 26000 }),
        firstSeen: "2026-10-01",
        lastSeen: "2026-10-01",
        active: true,
        sightings: 1,
      },
    ],
  };
  const next = mergeArchive(previous, published([], "2026-10-02T00:00:00.000Z"));
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0]?.domain, "amber.co");
  assert.equal(next.rows[0]?.active, false);
});
