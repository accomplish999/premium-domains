import { splitDomain } from "./domain";
import type { WordLists } from "./words";

export interface FilterOptions {
  tlds: Set<string>;
  minLength: number;
  maxLength: number;
  words: WordLists;
}

const SHORT_LABEL = 6;
const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

/** Extensions the published list has to cover, including when a feed has zero rows. */
export const REQUIRED_TLDS = [
  "com",
  "co",
  "io",
  "sh",
  "ly",
  "org",
  "net",
  "to",
  "gg",
  "ai",
  "me",
  "pro",
  "xyz",
  "app",
] as const;

const REQUIRED = new Set<string>(REQUIRED_TLDS);

export function isRequiredTld(tld: string): boolean {
  return REQUIRED.has(tld);
}

/** Two dictionary words. A 3-letter part has to be a common English word, so random strings do not split on obscure hits. */
export function isDictionaryCompound(label: string, words: WordLists): boolean {
  const n = label.length;
  if (n < 6 || n > 16) return false;
  for (let i = 3; i <= n - 3; i++) {
    const left = label.slice(0, i);
    const right = label.slice(i);
    if (left.length > 12 || right.length > 12) continue;
    if (!words.dictionary.has(left) || !words.dictionary.has(right)) continue;
    const bothCommon = words.common.has(left) && words.common.has(right);
    const bothLong = left.length >= 5 && right.length >= 5;
    if (bothCommon || bothLong) return true;
  }
  return false;
}

/** 7 or 8 letters, consonant and vowel alternating. Shorter labels are already kept. */
export function isBrandable(label: string): boolean {
  const n = label.length;
  if (n !== 7 && n !== 8) return false;
  const alternate = (startVowel: boolean): boolean => {
    for (let i = 0; i < n; i++) {
      const vowel = VOWELS.has(label[i] ?? "");
      const want = i % 2 === 0 ? startVowel : !startVowel;
      if (vowel !== want) return false;
    }
    return true;
  };
  return alternate(false) || alternate(true);
}

export function keepDomain(domain: string, options: FilterOptions): boolean {
  const parts = splitDomain(domain);
  if (!parts) return false;
  if (options.tlds.size > 0 && !options.tlds.has(parts.tld)) return false;
  if (!/^[a-z]+$/.test(parts.label)) return false;
  const n = parts.label.length;
  if (n < options.minLength || n > options.maxLength) return false;
  const listed = options.tlds.size > 0 || isRequiredTld(parts.tld);
  // Other TLDs stay at four letters or a dictionary word. Six-letter compounds on
  // those TLDs are hundreds of thousands of rows and do not fit in the daily budget.
  if (n <= (listed ? SHORT_LABEL : 4)) return true;
  if (options.words.dictionary.has(parts.label)) return true;
  if (!listed) return false;
  if (isDictionaryCompound(parts.label, options.words)) return true;
  return isBrandable(parts.label);
}

/** Letter-only names on a curated list. Digits and hyphens are junk. The dictionary pass does not apply. */
export function keepLetterDomain(domain: string, maxLength = 24): boolean {
  const parts = splitDomain(domain);
  if (!parts) return false;
  if (!/^[a-z]+$/.test(parts.label)) return false;
  return parts.label.length >= 1 && parts.label.length <= maxLength;
}

export function keepParkDomain(domain: string): boolean {
  return keepLetterDomain(domain);
}

export function keepListing(listing: { domain: string; source: string }, options: FilterOptions): boolean {
  if (listing.source === "parkio" || listing.source === "atom") return keepLetterDomain(listing.domain);
  return keepDomain(listing.domain, options);
}

export function candidateRank(domain: string, words: WordLists, source = ""): [number, number, number, number, string] {
  const parts = splitDomain(domain);
  const label = parts?.label ?? domain;
  const letters = /^[a-z]+$/.test(label);
  const curated = source === "parkio" || source === "atom";
  const priority = parts && isRequiredTld(parts.tld) ? 0 : 1;
  let bucket = 3;
  if (letters && label.length <= SHORT_LABEL) bucket = 0;
  else if (words.dictionary.has(label)) bucket = 1;
  else if (curated) bucket = 2;
  const common = words.common.has(label) ? 0 : 1;
  return [priority, bucket, label.length, common, domain];
}

export function compareRank(
  a: [number, number, number, number, string],
  b: [number, number, number, number, string],
): number {
  for (let i = 0; i < 5; i++) {
    const left = a[i];
    const right = b[i];
    if (left === undefined || right === undefined) continue;
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return 0;
}
