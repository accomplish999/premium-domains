import assert from "node:assert/strict";
import { test } from "node:test";
import { parseValuations } from "../src/value/humbleworth";

test("marketplace is the field the threshold uses", () => {
  const values = parseValuations({
    valuations: [
      { domain: "CoatFinder.com", auction: 35, marketplace: 2616, brokerage: 7871 },
      { domain: "skip.com", auction: 1, marketplace: 2, brokerage: 3, error: "bad" },
    ],
  });
  assert.equal(values.length, 1);
  assert.equal(values[0]?.domain, "coatfinder.com");
  assert.equal(values[0]?.marketplace, 2616);
});

test("replicate output wrapper is unwrapped", () => {
  const values = parseValuations({
    status: "succeeded",
    output: { valuations: [{ domain: "thesis.co", auction: 1000, marketplace: 40000, brokerage: 80000 }] },
  });
  assert.equal(values[0]?.marketplace, 40000);
});
