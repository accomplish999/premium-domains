import { explainStatus, request, type FetchLike } from "../http";
import type { Valuation } from "../types";

const REPLICATE_MODEL = "https://api.replicate.com/v1/models/humbleworth/price-predict-v1/predictions";
const REPLICATE_VERSION = "a925db842c707850e4ca7b7e86b217692b0353a9ca05eb028802c4a85db93843";
const SITE_URL = "https://humbleworth.com/api/valuation";
const LEGACY_URL = "https://valuation.humbleworth.com/api/valuation";

export const REPLICATE_BATCH = 2560;
export const SITE_BATCH = 2000;

interface RawValuation {
  domain?: string;
  auction?: number;
  marketplace?: number;
  brokerage?: number;
  error?: string | null;
}

export function parseValuations(payload: unknown): Valuation[] {
  const body = unwrap(payload);
  const list = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { valuations?: unknown }).valuations)
      ? (body as { valuations: unknown[] }).valuations
      : null;
  if (!list) throw new Error("HumbleWorth response had no valuations array.");
  const values: Valuation[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as RawValuation;
    if (row.error) continue;
    const domain = row.domain?.trim().toLowerCase();
    if (!domain) continue;
    if (!isMoney(row.auction) || !isMoney(row.marketplace) || !isMoney(row.brokerage)) continue;
    values.push({
      domain,
      auction: row.auction,
      marketplace: row.marketplace,
      brokerage: row.brokerage,
    });
  }
  return values;
}

function unwrap(payload: unknown): unknown {
  if (typeof payload === "string") {
    try {
      return unwrap(JSON.parse(payload) as unknown);
    } catch {
      return payload;
    }
  }
  if (!payload || typeof payload !== "object") return payload;
  const record = payload as { output?: unknown; valuations?: unknown };
  if (record.output !== undefined) return unwrap(record.output);
  return payload;
}

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function valueDomains(
  domains: string[],
  fetchImpl: FetchLike,
  env: NodeJS.ProcessEnv,
): Promise<Valuation[]> {
  if (domains.length === 0) return [];
  const token = env.REPLICATE_API_TOKEN?.trim();
  if (token) return valueReplicate(domains, fetchImpl, token);
  const site = await valuePost(SITE_URL, domains, fetchImpl, SITE_BATCH);
  if (site) return site;
  const legacy = await valuePost(LEGACY_URL, domains, fetchImpl, 20);
  if (legacy) return legacy;
  throw new Error(
    "HumbleWorth valuation is unavailable. Set REPLICATE_API_TOKEN. The documented bulk API is the Replicate model humbleworth/price-predict-v1. The free site at humbleworth.com did not return a valuation body from this network.",
  );
}

async function valueReplicate(domains: string[], fetchImpl: FetchLike, token: string): Promise<Valuation[]> {
  const values: Valuation[] = [];
  for (let i = 0; i < domains.length; i += REPLICATE_BATCH) {
    const batch = domains.slice(i, i + REPLICATE_BATCH);
    const created = await request(REPLICATE_MODEL, fetchImpl, {
      method: "POST",
      timeoutMs: 90_000,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        prefer: "wait=60",
      },
      body: JSON.stringify({
        version: REPLICATE_VERSION,
        input: { domains: batch.join(",") },
      }),
    });
    if (created.status !== 200 && created.status !== 201) {
      throw new Error(`HumbleWorth Replicate ${explainStatus(created.status, created.text)}`);
    }
    let payload = JSON.parse(created.text) as {
      status?: string;
      output?: unknown;
      urls?: { get?: string };
      error?: string;
    };
    if (payload.error) throw new Error(`HumbleWorth Replicate error: ${payload.error}`);
    if (payload.status && payload.status !== "succeeded" && payload.urls?.get) {
      payload = await pollReplicate(payload.urls.get, fetchImpl, token);
    }
    values.push(...parseValuations(payload));
  }
  return values;
}

async function pollReplicate(
  url: string,
  fetchImpl: FetchLike,
  token: string,
): Promise<{ output?: unknown; error?: string }> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await request(url, fetchImpl, {
      timeoutMs: 30_000,
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    if (response.status !== 200) throw new Error(`HumbleWorth poll ${explainStatus(response.status, response.text)}`);
    const body = JSON.parse(response.text) as { status?: string; output?: unknown; error?: string };
    if (body.status === "succeeded") return body;
    if (body.status === "failed" || body.status === "canceled") {
      throw new Error(`HumbleWorth Replicate ${body.status}. ${body.error ?? ""}`.trim());
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("HumbleWorth Replicate prediction did not finish.");
}

async function valuePost(
  url: string,
  domains: string[],
  fetchImpl: FetchLike,
  batchSize: number,
): Promise<Valuation[] | null> {
  const values: Valuation[] = [];
  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    let response;
    try {
      response = await request(url, fetchImpl, {
        method: "POST",
        timeoutMs: 60_000,
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ domains: batch.join(",") }),
      });
    } catch {
      return null;
    }
    if (response.status === 404 || response.status === 405 || response.status === 429 || response.status >= 500)
      return null;
    if (response.status !== 200) return null;
    if (!response.text.trim().startsWith("{") && !response.text.trim().startsWith("[")) return null;
    try {
      values.push(...parseValuations(JSON.parse(response.text) as unknown));
    } catch {
      return null;
    }
  }
  return values;
}
