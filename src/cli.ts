#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { InputError, isInputError } from "./errors";
import { formatText } from "./format";
import { scan, type ScanOptions } from "./run";
import { SOURCES } from "./sources/registry";
import type { Envelope, Listing, Valuation } from "./types";
import { VERSION } from "./version";
import { loadWords } from "./words";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface Flags {
  json: boolean;
  strict: boolean;
  onlyNew: boolean;
  positionals: string[];
  map: Map<string, string>;
}

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<RunResult> {
  try {
    const flags = parseArgv(argv);
    const command = flags.positionals[0] ?? "scan";
    if (command === "help" || flags.map.has("help")) return { code: 0, stdout: helpText(), stderr: "" };
    if (command === "version" || flags.map.has("version")) return { code: 0, stdout: `${VERSION}\n`, stderr: "" };
    if (command === "sources") return sourcesCommand(flags, env);
    if (command !== "scan") throw new InputError("UNKNOWN_COMMAND", `Unknown command ${command}.`);
    const envelope = await scan(buildOptions(flags, env));
    const loud = envelope.warnings.some((warning) => warning.severity === "loud");
    const code = !envelope.ok || (flags.strict && loud) ? 3 : 0;
    const stdout = flags.json ? `${JSON.stringify(envelope)}\n` : formatText(envelope, flags.onlyNew);
    return { code, stdout, stderr: "" };
  } catch (err) {
    if (isInputError(err)) {
      const envelope: Envelope = {
        ok: false,
        tool: "scan",
        warnings: [{ code: err.code, severity: "loud", message: err.message }],
        result: null,
      };
      return { code: 2, stdout: `${JSON.stringify(envelope)}\n`, stderr: `${err.message}\n` };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { code: 1, stdout: "", stderr: `${message}\n` };
  }
}

function sourcesCommand(flags: Flags, env: NodeJS.ProcessEnv): RunResult {
  const rows = SOURCES.map((source) => ({
    id: source.id,
    label: source.label,
    blurb: source.blurb,
    defaultEnabled: source.defaultEnabled,
    keyEnv: source.keyEnv,
    keysPresent: source.keyEnv.every((key) => Boolean(env[key]?.trim())),
  }));
  if (flags.json) {
    const envelope = { ok: true, tool: "sources", warnings: [], result: { sources: rows } };
    return { code: 0, stdout: `${JSON.stringify(envelope)}\n`, stderr: "" };
  }
  const lines = rows.map((row) => {
    const keys =
      row.keyEnv.length === 0 ? "no key" : row.keysPresent ? "key present" : `needs ${row.keyEnv.join(", ")}`;
    const enabled = row.defaultEnabled ? "on" : "off";
    return `${row.id} ${enabled} ${keys} ${row.blurb}`;
  });
  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}

function buildOptions(flags: Flags, env: NodeJS.ProcessEnv): ScanOptions {
  const threshold = numberFlag(flags, "threshold", env.PREMIUM_DOMAINS_THRESHOLD ?? "25000");
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new InputError("BAD_THRESHOLD", "Threshold must be a non-negative number of dollars.");
  }
  const minLength = integerFlag(flags, "min-length", "1");
  const maxLength = integerFlag(flags, "max-length", "10");
  const maxValues = integerFlag(flags, "max-values", env.PREMIUM_DOMAINS_MAX_VALUES ?? "500");
  if (minLength < 1 || maxLength < minLength)
    throw new InputError("BAD_LENGTH", "Check --min-length and --max-length.");
  if (maxValues < 1) throw new InputError("BAD_MAX", "--max-values must be at least 1.");
  const tlds = (flag(flags, "tlds") ?? "com,co,io,ai")
    .split(",")
    .map((tld) => tld.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
  if (tlds.length === 0) throw new InputError("BAD_TLDS", "Pass at least one TLD.");
  const sourcesRaw = flag(flags, "sources");
  const listingsPath = flag(flags, "listings");
  const valuesPath = flag(flags, "values");
  const outDir = flag(flags, "out") ?? null;
  return {
    threshold,
    tlds,
    minLength,
    maxLength,
    maxValues,
    sources: sourcesRaw
      ? sourcesRaw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : null,
    outDir,
    statePath: flag(flags, "state") ?? "results/state.json",
    cachePath: flag(flags, "cache") ?? "results/cache.json",
    cacheDays: integerFlag(flags, "cache-days", "14"),
    fetch: globalThis.fetch,
    now: new Date(),
    words: loadWords(),
    env,
    listings: listingsPath ? readListings(listingsPath) : undefined,
    values: valuesPath ? readValues(valuesPath) : undefined,
  };
}

function readListings(file: string): Listing[] {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Listing[];
  if (!Array.isArray(parsed)) throw new InputError("BAD_LISTINGS", "--listings must be a JSON array.");
  return parsed;
}

function readValues(file: string): Map<string, Valuation> {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, Valuation>;
  const map = new Map<string, Valuation>();
  for (const [domain, value] of Object.entries(parsed)) {
    map.set(domain.toLowerCase(), { ...value, domain: domain.toLowerCase() });
  }
  return map;
}

function parseArgv(argv: string[]): Flags {
  const map = new Map<string, string>();
  const positionals: string[] = [];
  let json = false;
  let strict = false;
  let onlyNew = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--strict") {
      strict = true;
      continue;
    }
    if (token === "--new") {
      onlyNew = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      positionals.push("help");
      continue;
    }
    if (token === "--version" || token === "-v") {
      positionals.push("version");
      continue;
    }
    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      let key: string;
      let value: string | undefined;
      if (eq >= 0) {
        key = body.slice(0, eq);
        value = body.slice(eq + 1);
      } else {
        key = body;
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          value = next;
          i++;
        }
      }
      map.set(key, value ?? "true");
      continue;
    }
    positionals.push(token);
  }
  return { json, strict, onlyNew, positionals, map };
}

function flag(flags: Flags, key: string): string | undefined {
  return flags.map.get(key);
}

function numberFlag(flags: Flags, key: string, fallback: string): number {
  return Number(flag(flags, key) ?? fallback);
}

function integerFlag(flags: Flags, key: string, fallback: string): number {
  const value = Number(flag(flags, key) ?? fallback);
  if (!Number.isInteger(value)) throw new InputError("BAD_NUMBER", `--${key} must be an integer.`);
  return value;
}

function helpText(): string {
  return `premium-domains ${VERSION}

Daily list of premium names for sale whose HumbleWorth marketplace estimate is above a floor.
This is a list. It is not a bid, and it is not an appraisal.

  premium-domains scan --json
  premium-domains scan --threshold 25000 --sources parkio,dynadot,godaddy,sedo
  premium-domains scan --new --out results
  premium-domains sources

Flags
  --json                 Print the envelope. Read ok, then warnings, then result.
  --strict               Exit 3 when a loud warning is present. The body is still printed.
  --threshold 25000      Marketplace dollars. A name is kept only when the estimate is above this.
  --tlds com,co,io,ai    Labels after the dot.
  --min-length 1         Count letters in the label.
  --max-length 10
  --max-values 500       How many prefiltered names to send for valuation. Shortest, then .com.
  --sources a,b          Replace the default source set.
  --out results          Write latest.json, latest.csv, and new.csv.
  --state results/state.json
  --cache results/cache.json
  --cache-days 14
  --new                  Text output shows only names absent from the previous above-threshold set.
  --listings file.json   Skip the network and read listings from a file.
  --values file.json     Skip HumbleWorth and read estimates from a file.

Valuation defaults to the published price-predict-v1 weights on CPU.
Set HUMBLEWORTH_BACKEND=replicate and REPLICATE_API_TOKEN to use the hosted model.

Exit 0 means the run finished. It does not mean a name is worth the estimate.
A loud warning still comes with a body. --strict turns that warning into exit 3.
`;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((result) => {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exitCode = result.code;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
