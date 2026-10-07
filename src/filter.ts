import { splitDomain } from "./domain";
import type { WordLists } from "./words";

export interface FilterOptions {
  tlds: Set<string>;
  minLength: number;
  maxLength: number;
  words: WordLists;
}

export function keepDomain(domain: string, options: FilterOptions): boolean {
  const parts = splitDomain(domain);
  if (!parts) return false;
  if (!options.tlds.has(parts.tld)) return false;
  if (!/^[a-z]+$/.test(parts.label)) return false;
  if (parts.label.length < options.minLength || parts.label.length > options.maxLength) return false;
  if (parts.label.length <= 2) return true;
  return options.words.dictionary.has(parts.label);
}

export function candidateRank(domain: string, words: WordLists): [number, number, number, string] {
  const parts = splitDomain(domain);
  const label = parts?.label ?? domain;
  const tld = parts?.tld ?? "";
  const tldRank = tld === "com" ? 0 : tld === "co" ? 1 : tld === "io" ? 2 : tld === "ai" ? 3 : 9;
  const common = words.common.has(label) ? 0 : 1;
  return [label.length, tldRank, common, domain];
}

export function compareRank(a: [number, number, number, string], b: [number, number, number, string]): number {
  for (let i = 0; i < 4; i++) {
    const left = a[i];
    const right = b[i];
    if (left === undefined || right === undefined) continue;
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return 0;
}
