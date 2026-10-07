const TZ_OFFSET_HOURS: Record<string, number> = {
  EDT: -4,
  EST: -5,
  CDT: -5,
  CST: -6,
  MDT: -6,
  MST: -7,
  PDT: -7,
  PST: -8,
  UTC: 0,
  GMT: 0,
};

export interface DomainParts {
  domain: string;
  label: string;
  tld: string;
}

export function countTld(counts: Record<string, number>, domain: string): void {
  const parts = splitDomain(domain);
  const tld = parts?.tld ?? "other";
  counts[tld] = (counts[tld] ?? 0) + 1;
}

export function splitDomain(raw: string): DomainParts | null {
  const domain = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!domain || domain.includes("..")) return null;
  const parts = domain.split(".");
  if (parts.length !== 2) return null;
  const label = parts[0];
  const tld = parts[1];
  if (!label || !tld) return null;
  if (!/^[a-z0-9-]+$/.test(label) || !/^[a-z0-9]+$/.test(tld)) return null;
  return { domain: `${label}.${tld}`, label, tld };
}

export function parseMoney(
  raw: string | number | null | undefined,
): { amount: number; currency: string | null } | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return { amount: raw, currency: null };
  }
  const text = raw.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower === "make offer" || lower === "offer" || lower === "-" || lower === "n/a" || lower === "na") return null;
  let currency: string | null = null;
  if (/eur/i.test(text)) currency = "EUR";
  else if (/gbp|£/i.test(text)) currency = "GBP";
  else if (/\$us|us\$|usd|\$/i.test(text)) currency = "USD";
  const numeric = text.replace(/[^\d.,-]/g, "");
  if (!numeric || numeric === "-" || numeric === "." || numeric === ",") return null;
  const amount = parseNumberToken(numeric);
  if (amount === null) return null;
  return { amount, currency };
}

export function parseEuropeanThousands(raw: string): { amount: number; currency: string | null } | null {
  const text = raw.trim();
  const lower = text.toLowerCase();
  if (!text || lower === "make offer" || lower === "offer") return null;
  let currency: string | null = null;
  if (/eur/i.test(text)) currency = "EUR";
  else if (/gbp|£/i.test(text)) currency = "GBP";
  else if (/\$us|us\$|usd|\$/i.test(text)) currency = "USD";
  const numeric = text.replace(/[^\d.,]/g, "");
  if (!numeric) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(numeric)) {
    return { amount: Number(numeric.replace(/\./g, "")), currency };
  }
  return parseMoney(text);
}

function parseNumberToken(numeric: string): number | null {
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(numeric)) {
    const value = Number(numeric.replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  }
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(numeric)) {
    const value = Number(numeric.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }
  const value = Number(numeric.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

export function parseParkStamp(raw: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})([A-Za-z]{2,4})(\d{2}):(\d{2}):(\d{2})(\d{3})$/.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const day = Number(match[2]);
  const month = Number(match[3]);
  const zone = (match[4] ?? "").toUpperCase();
  const hour = Number(match[5]);
  const minute = Number(match[6]);
  const second = Number(match[7]);
  const ms = Number(match[8]);
  const offset = TZ_OFFSET_HOURS[zone];
  if (offset === undefined) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(year, month - 1, day, hour, minute, second, ms) - offset * 3_600_000;
  return new Date(utc).toISOString();
}

export function parseUnix(raw: string | number, unit: "s" | "ms"): string | null {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  const ms = unit === "s" ? value * 1000 : value;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function dateOnly(raw: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`;
}

export function formatUsd(amount: number): string {
  const rounded = Math.round(amount);
  return `$${rounded.toLocaleString("en-US")}`;
}

export function formatPrice(amount: number | null, currency: string | null): string {
  if (amount === null) return "";
  const rounded = Number.isInteger(amount) ? amount.toLocaleString("en-US") : amount.toLocaleString("en-US");
  if (!currency || currency === "USD") return `$${rounded}`;
  return `${rounded} ${currency}`;
}
