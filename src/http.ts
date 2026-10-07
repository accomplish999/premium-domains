export const USER_AGENT = "premium-domains/0.1 (+https://github.com/accomplish999/premium-domains)";

export type FetchLike = typeof fetch;

export interface HttpResult {
  status: number;
  text: string;
  bytes: Buffer;
  contentType: string;
  url: string;
}

export async function request(
  url: string,
  fetchImpl: FetchLike,
  init: { method?: string; body?: string; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<HttpResult> {
  let last: HttpResult | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetchImpl(url, {
      method: init.method ?? "GET",
      body: init.body,
      redirect: "follow",
      signal: AbortSignal.timeout(init.timeoutMs ?? 120_000),
      headers: {
        "user-agent": USER_AGENT,
        accept: "*/*",
        ...init.headers,
      },
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const result: HttpResult = {
      status: response.status,
      bytes,
      text: bytes.toString("utf8"),
      contentType: response.headers.get("content-type") ?? "",
      url: response.url || url,
    };
    last = result;
    if (response.status !== 429 && response.status < 500) return result;
    if (attempt < 2) await delay(400 * (attempt + 1));
  }
  if (!last) throw new Error(`No response from ${url}.`);
  return last;
}

export function explainStatus(status: number, body: string): string {
  const snippet = body.replace(/\s+/g, " ").slice(0, 180);
  if (status === 401 || status === 403) {
    if (/just a moment|cloudflare|security checkpoint|attention required/i.test(body)) {
      return `HTTP ${status}. The host answered with a bot check, not a feed.`;
    }
    return `HTTP ${status}. ${snippet}`.trim();
  }
  if (status === 429) return `HTTP 429. The host asked us to slow down.`;
  if (status >= 500) {
    if (/syntactically incorrect|http 500/i.test(body)) {
      return `HTTP ${status}. The download index is returning an error page instead of file links.`;
    }
    return `HTTP ${status}. ${snippet}`.trim();
  }
  return `HTTP ${status}. ${snippet}`.trim();
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
