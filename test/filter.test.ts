import assert from "node:assert/strict";
import { test } from "node:test";
import { keepDomain, keepParkDomain } from "../src/filter";
import { loadWords } from "../src/words";

const words = loadWords();
const options = {
  tlds: new Set(["com", "co", "io", "ai"]),
  minLength: 1,
  maxLength: 10,
  words,
};

test("dictionary names and one-letter names pass", () => {
  for (const domain of [
    "apple.co",
    "river.co",
    "garden.io",
    "silver.ai",
    "market.co",
    "letter.com",
    "orange.io",
    "planet.co",
    "window.ai",
    "bridge.co",
    "summer.io",
    "maple.co",
    "cedar.io",
    "q.co",
    "ab.io",
  ]) {
    assert.equal(keepDomain(domain, options), true, domain);
  }
});

test("hyphens, digits, long labels, and other TLDs fail", () => {
  assert.equal(keepDomain("blue-gas.com", options), false);
  assert.equal(keepDomain("0055.io", options), false);
  assert.equal(keepDomain("river.net", options), false);
  assert.equal(keepDomain("extraordinary.com", options), false);
  assert.equal(keepDomain("notawordqq.com", options), false);
  assert.equal(keepDomain("alpha.example.com", options), false);
});

test("park.io keeps letter-only names that the dictionary pass would drop", () => {
  assert.equal(keepParkDomain("fakt.io"), true);
  assert.equal(keepParkDomain("crew.ly"), true);
  assert.equal(keepParkDomain("q.me"), true);
  assert.equal(keepParkDomain("notawordqq.sh"), true);
  assert.equal(keepParkDomain("0055.io"), false);
  assert.equal(keepParkDomain("blue-gas.com"), false);
  assert.equal(keepParkDomain("alpha.example.com"), false);
});
