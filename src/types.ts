export type ListingType = "drop" | "auction" | "buynow";

export interface Listing {
  domain: string;
  source: string;
  price: number | null;
  currency: string | null;
  auctionEnd: string | null;
  link: string;
  listingType: ListingType;
}

export interface Valuation {
  domain: string;
  auction: number;
  marketplace: number;
  brokerage: number;
}

export interface ValuedListing extends Listing {
  marketplace: number;
  auctionValue: number;
  brokerage: number;
  alsoSeenOn: string[];
}

export interface Warning {
  code: string;
  severity: "loud" | "note";
  message: string;
}

export interface SourceReport {
  id: string;
  enabled: boolean;
  ok: boolean;
  skipped: boolean;
  fetched: number;
  kept: number;
  valued: number;
  above: number;
  error?: string;
}

export interface ScanStats {
  fetched: number;
  kept: number;
  valued: number;
  above: number;
  highestMarketplace: number | null;
  truncated: boolean;
}

export interface ScanResult {
  generatedAt: string;
  threshold: number;
  rows: ValuedListing[];
  newRows: ValuedListing[];
  sources: SourceReport[];
  stats: ScanStats;
}

export interface Envelope {
  ok: boolean;
  tool: string;
  warnings: Warning[];
  result: ScanResult | { sources: SourceReport[] } | null;
}
