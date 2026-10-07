import { inflateRawSync } from "node:zlib";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quote = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] ?? "";
    if (quote) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quote = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quote = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  return rows;
}

export function headerIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    map.set(header.trim().toLowerCase(), index);
  });
  return map;
}

export function cell(row: string[], index: Map<string, number>, names: string[]): string {
  for (const name of names) {
    const at = index.get(name);
    if (at === undefined) continue;
    return (row[at] ?? "").trim();
  }
  return "";
}

export function unzipFirst(buf: Buffer): Buffer {
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const signature = buf.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = buf.readUInt16LE(offset + 8);
    const compressed = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLen + extraLen;
    if (compressed === 0 || start + compressed > buf.length) {
      offset = Math.max(start, offset + 1);
      continue;
    }
    const data = buf.subarray(start, start + compressed);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return inflateRawSync(data);
    throw new Error(`Unsupported zip method ${method}.`);
  }
  throw new Error("Zip contained no file.");
}

export function* jsonObjects(text: string): Generator<unknown> {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("[")) {
    yield* objectsInArray(text, text.indexOf("["));
    return;
  }
  const key = text.indexOf('"data"');
  const bracket = key >= 0 ? text.indexOf("[", key) : -1;
  if (bracket >= 0) {
    yield* objectsInArray(text, bracket);
  }
}

function* objectsInArray(text: string, bracket: number): Generator<unknown> {
  let i = bracket + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === undefined) return;
    if (ch === "]") return;
    if (ch === "{") {
      const end = endOfObject(text, i);
      yield JSON.parse(text.slice(i, end)) as unknown;
      i = end;
      continue;
    }
    i++;
  }
}

function endOfObject(text: string, start: number): number {
  let depth = 0;
  let quote = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') quote = false;
      continue;
    }
    if (ch === '"') {
      quote = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error("Unclosed JSON object.");
}
