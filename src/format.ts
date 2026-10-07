import { formatPrice, formatUsd } from "./domain";
import type { Envelope, ScanResult, SourceReport, ValuedListing } from "./types";

export function formatText(envelope: Envelope, onlyNew: boolean): string {
  const lines: string[] = [];
  lines.push(`premium-domains ${envelope.tool}`);
  if (!envelope.result || !("rows" in envelope.result)) {
    for (const warning of envelope.warnings) lines.push(`${warning.severity}: ${warning.code} ${warning.message}`);
    return `${lines.join("\n")}\n`;
  }
  const result = envelope.result;
  lines.push(`threshold ${formatUsd(result.threshold)} marketplace`);
  lines.push(`generated ${result.generatedAt}`);
  for (const source of result.sources) lines.push(formatSource(source));
  for (const warning of envelope.warnings) lines.push(`${warning.severity}: ${warning.code} ${warning.message}`);
  const rows = onlyNew ? result.newRows : result.rows;
  lines.push("");
  lines.push(table(rows));
  lines.push("");
  lines.push(
    `${rows.length} domain${rows.length === 1 ? "" : "s"}${onlyNew ? " new since last run" : ` at or above ${formatUsd(result.threshold)}`}`,
  );
  lines.push(`valued ${result.stats.valued}`);
  lines.push(
    result.stats.highestMarketplace === null
      ? "highest marketplace none"
      : `highest marketplace ${formatUsd(result.stats.highestMarketplace)}`,
  );
  lines.push(`new since last run ${result.newRows.length}`);
  return `${lines.join("\n")}\n`;
}

function formatSource(source: SourceReport): string {
  if (!source.enabled) return `${source.id} off`;
  if (source.skipped) return `${source.id} skipped`;
  if (!source.ok) return `${source.id} failed ${source.error ?? ""}`.trim();
  return `${source.id} fetched ${source.fetched} kept ${source.kept}`;
}

function table(rows: ValuedListing[]): string {
  const header = ["domain", "source", "price", "ends", "marketplace", "link"];
  const body = rows.map((row) => [
    row.domain,
    row.alsoSeenOn.length > 0 ? `${row.source}+${row.alsoSeenOn.join("+")}` : row.source,
    formatPrice(row.price, row.currency),
    row.auctionEnd ?? "",
    formatUsd(row.marketplace),
    row.link,
  ]);
  const widths = header.map((name, index) => Math.max(name.length, ...body.map((line) => (line[index] ?? "").length)));
  const render = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join("  ");
  return [render(header), ...body.map(render)].join("\n");
}

export function formatCsv(rows: ValuedListing[], fresh: Set<string>): string {
  const header = [
    "domain",
    "source",
    "price",
    "currency",
    "auction_end",
    "marketplace",
    "auction_value",
    "brokerage",
    "link",
    "also_seen_on",
    "new",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.domain,
        row.source,
        row.price === null ? "" : String(row.price),
        row.currency ?? "",
        row.auctionEnd ?? "",
        String(row.marketplace),
        String(row.auctionValue),
        String(row.brokerage),
        row.link,
        row.alsoSeenOn.join(" "),
        fresh.has(row.domain) ? "yes" : "no",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function isScanResult(result: Envelope["result"]): result is ScanResult {
  return !!result && "rows" in result;
}
