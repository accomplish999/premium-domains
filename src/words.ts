import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export interface WordLists {
  dictionary: Set<string>;
  common: Set<string>;
}

export function repoRoot(): string {
  const candidates = [path.resolve(__dirname, ".."), path.resolve(__dirname, "../.."), process.cwd()];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "data", "words.txt"))) return dir;
  }
  return process.cwd();
}

export function loadWords(root = repoRoot()): WordLists {
  const dictionary = readWordFile(path.join(root, "data", "words.txt"));
  const extraPath = path.join(root, "data", "extra.txt");
  if (existsSync(extraPath)) {
    for (const word of readWordFile(extraPath)) dictionary.add(word);
  }
  const common = readWordFile(path.join(root, "data", "common.txt"));
  return { dictionary, common };
}

function readWordFile(file: string): Set<string> {
  const set = new Set<string>();
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const word = line.trim().toLowerCase();
    if (word) set.add(word);
  }
  return set;
}
