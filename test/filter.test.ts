import assert from "node:assert/strict";
import { test } from "node:test";
import { keepDomain, keepParkDomain } from "../src/filter";
import { loadWords } from "../src/words";

const words = loadWords();
const options = {
  tlds: new Set<string>(),
  minLength: 1,
  maxLength: 16,
  words,
};

test("short labels, dictionary words, compounds, and brandable patterns pass on every TLD", () => {
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
    "fakt.io",
    "river.net",
    "smart.org",
    "nova.xyz",
    "mind.app",
    "crew.me",
    "crew.ly",
    "awsm.sh",
    "go.to",
    "play.gg",
    "mind.ai",
    "job.pro",
    "nova.xyz",
    "spark.app",
    "bluebird.com",
    "extraordinary.com",
    "bamateko.com",
  ]) {
    assert.equal(keepDomain(domain, options), true, domain);
  }
});

test("six-letter labels outside the listed extensions do not pass on length alone", () => {
  assert.equal(keepDomain("abcdef.shop", options), false);
  assert.equal(keepDomain("abcd.shop", options), true);
  assert.equal(keepDomain("abcdef.io", options), true);
});

test("an explicit TLD list still drops the other TLDs", () => {
  const limited = { ...options, tlds: new Set(["com", "co", "io", "ai"]) };
  assert.equal(keepDomain("river.net", limited), false);
  assert.equal(keepDomain("river.co", limited), true);
});

test("hyphens, digits, long junk, and a tight max length fail", () => {
  assert.equal(keepDomain("blue-gas.com", options), false);
  assert.equal(keepDomain("0055.io", options), false);
  assert.equal(keepDomain("notawordqq.com", options), false);
  assert.equal(keepDomain("zzzzqqqq.com", options), false);
  assert.equal(keepDomain("alpha.example.com", options), false);
  assert.equal(keepDomain("extraordinary.com", { ...options, maxLength: 10 }), false);
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
