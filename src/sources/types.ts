import type { FetchLike } from "../http";
import type { FilterOptions } from "../filter";
import type { Listing, Warning } from "../types";

export interface SourceContext {
  fetch: FetchLike;
  env: NodeJS.ProcessEnv;
  filter: FilterOptions;
  now: Date;
}

export interface SourceLoad {
  listings: Listing[];
  fetched: number;
  warnings: Warning[];
  skipped: boolean;
  fetchedByTld?: Record<string, number>;
}

export interface SourceAdapter {
  id: string;
  label: string;
  blurb: string;
  defaultEnabled: boolean;
  keyEnv: string[];
  load(ctx: SourceContext): Promise<SourceLoad>;
}

export function emptyLoad(): SourceLoad {
  return { listings: [], fetched: 0, warnings: [], skipped: false };
}
