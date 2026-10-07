import assert from "node:assert/strict";
import { test } from "node:test";
import { keepDomain } from "../src/filter";
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
    "compound.co",
    "inquiry.co",
    "thesis.co",
    "keyword.co",
    "ghost.co",
    "wiki.co",
    "hacker.co",
    "maze.co",
    "strive.co",
    "tribe.co",
    "drop.co",
    "hey.co",
    "shop.io",
    "base.io",
    "z.co",
    "e.co",
  ]) {
    assert.equal(keepDomain(domain, options), true, domain);
  }
});

test("hyphens, digits, long labels, and other TLDs fail", () => {
  assert.equal(keepDomain("blue-gas.com", options), false);
  assert.equal(keepDomain("0055.io", options), false);
  assert.equal(keepDomain("compound.net", options), false);
  assert.equal(keepDomain("extraordinary.com", options), false);
  assert.equal(keepDomain("notawordqq.com", options), false);
  assert.equal(keepDomain("shop.example.com", options), false);
});
