# premium-domains

[![Accomplish](web/wordmark.png)](https://accompli.sh/premium-domains)

A name clears the list when a public feed is offering it and the HumbleWorth marketplace estimate is above the floor. The floor is 25000 dollars unless you pass another one.

Short labels, dictionary words, and the TLDs `.com`, `.co`, `.io`, and `.ai` are the cheap pass. That pass runs first so the valuation call stays small. The caliber the filter is aimed at looks like compound.co, inquiry.co, thesis.co, keyword.co, ghost.co, wiki.co, hacker.co, maze.co, strive.co, tribe.co, drop.co, hey.co, shop.io, z.co, e.co, and base.io. One letter and two letters pass on length. Longer labels pass when they are in the word list.

This is a list. It is not a bid, and it is not an appraisal. An estimate is a model. Past sales do not set the next sale.

## Contents

- [What is listed](#what-is-listed)
- [The floor](#the-floor)
- [Feeds](#feeds)
- [Output](#output)
- [Daily run](#daily-run)
- [Published file](#published-file)
- [CLI](docs/CLI.md)
- [Page](#page)
- [Limits](#limits)

Flags are in [docs/CLI.md](docs/CLI.md). Feeds, keys, and the valuation call are in [docs/SOURCES.md](docs/SOURCES.md). The JSON envelope is in [docs/AGENTS.md](docs/AGENTS.md).

## What is listed

A row has the domain, the feed, the price or current bid when the feed has one, the auction end or the drop date, the HumbleWorth marketplace estimate, and a link.

The same domain on two feeds becomes one row. The row keeps the listing that has a price, then the one that ends sooner. The other feed ids sit on `alsoSeenOn`.

`new` is the set of domains that cleared the floor and were not in the state file at the start of the run. The first successful run marks every row new. After that, the state file is the previous above-floor set.

## The floor

HumbleWorth returns three numbers. Auction is the 50th percentile. Marketplace is the 97.5th percentile, a direct marketplace sale. Brokerage is the 99.25th percentile. This tool compares marketplace to the floor. A name at the floor is not above it, so it is left out.

The default valuation runs HumbleWorth's published `price-predict-v1` weights on CPU. The weights are in the public image `r8.im/humbleworth/price-predict-v1`. The first run downloads that layer and caches it. No Replicate token is required.

`HUMBLEWORTH_BACKEND=replicate` keeps the hosted model as an option. That path needs `REPLICATE_API_TOKEN`. One hosted request takes up to 2560 names and Replicate bills about $0.10 per 1000 predictions. `--max-values` defaults to 500. The estimate cache lasts 14 days. The free page on humbleworth.com answers this network with a bot challenge, and the older valuation host does not complete TLS. The program does not try to get around either of those. Details are in [docs/SOURCES.md](docs/SOURCES.md).

## Feeds

| Id          | What it reads                                     | Key                                                                  |
| ----------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| `parkio`    | Auction JSON, dropping JSON per TLD, premium JSON | none                                                                 |
| `dynadot`   | Expired, user, and pre-expiry auction CSV         | none                                                                 |
| `godaddy`   | Inventory Protocol zip files                      | none                                                                 |
| `sedo`      | Public auction and top-name text feeds            | none                                                                 |
| `namejet`   | Official download page                            | none. The index lists CSV files. Those downloads returned HTTP 403.  |
| `snapnames` | Official download page                            | none, and the page was HTTP 403                                      |
| `dropcatch` | Official auction CSV download                     | `DROPCATCH_CLIENT_ID`, `DROPCATCH_CLIENT_SECRET`                     |
| `afternic`  | A CSV you supply                                  | off unless you set `AFTERNIC_FEED_URL` and pass `--sources afternic` |

Afternic does not publish a catalog. NameJet lists CSV files, and those downloads returned HTTP 403. SnapNames returned HTTP 403 for the page. The adapters stay on so a later run records the status instead of pretending the feeds were read.

## Output

Text is a table. `--json` is the envelope: `ok`, then `warnings`, then `result`. `--out results` writes `latest.json`, `latest.csv`, `new.csv`, and `web-results.json`.

```bash
npx tsx src/cli.ts scan --json --out results
npx tsx src/cli.ts scan --new
npx tsx src/cli.ts sources
```

Exit 0 means the run finished. It does not mean a name is worth the estimate. Exit 3 means HumbleWorth did not answer, or `--strict` promoted a loud warning. The body is still printed. Exit 2 is a bad flag.

The checked-in examples are fixtures. They do not call the network:

```bash
npx tsx src/cli.ts scan --listings examples/listings.json --values examples/values.json
```

## Daily run

`.github/workflows/daily.yml` runs at 15:45 UTC and when you start it by hand. GoDaddy refreshes the inventory files in the hour before that. The job has `permissions: contents: write`. It caches the HumbleWorth weight layer, values every name that passed the prefilter (`--max-values 100000`), and uploads `results/` as an artifact.

When the process exits 0 and the file has a `generatedAt`, at least one valued name, and `stats.truncated` false, the job copies that file to `data/results.json` and `web/results.json`. It commits and pushes those two files only when the bytes changed. A failed valuation commits nothing. The artifact still holds the envelope so you can see which feeds answered.

The job values names with the local model. A `REPLICATE_API_TOKEN` secret is optional, and it is used only when `HUMBLEWORTH_BACKEND` is `replicate`. No token is required for the scheduled run.

## Published file

The list the page draws is [data/results.json](data/results.json). The same bytes are in `web/results.json`, which is what a relative fetch reads. The stable public URL is:

https://raw.githubusercontent.com/accomplish999/premium-domains/main/data/results.json

`generatedAt` is an ISO-8601 time. It is null only in the empty placeholder, before a scan has been committed. `threshold` is the marketplace floor in dollars. `rows` is every valued name strictly above that floor, highest marketplace first. `stats` counts the run.

| Field          | Meaning                                                                              |
| -------------- | ------------------------------------------------------------------------------------ |
| `domain`       | Lower case, one label and one TLD.                                                   |
| `marketplace`  | HumbleWorth marketplace estimate, USD. This is the number compared with `threshold`. |
| `source`       | The feed that supplied the price and the end time.                                   |
| `link`         | Listing or auction URL.                                                              |
| `price`        | Current bid or asking price, or null when the feed has no number.                    |
| `currency`     | As the feed labeled it. Not converted.                                               |
| `auctionEnd`   | Auction end, or the drop date, as an ISO time. Null when the feed has none.          |
| `listingType`  | `auction`, `buy_now`, `closeout`, `dropping`, or `marketplace`.                      |
| `auctionValue` | HumbleWorth auction estimate, USD.                                                   |
| `brokerage`    | HumbleWorth brokerage estimate, USD.                                                 |
| `alsoSeenOn`   | Other feeds that had the same domain in this run.                                    |

`stats.fetched` is rows read from the feeds. `stats.kept` is names that passed the prefilter. `stats.valued` is how many of those received a HumbleWorth estimate. `stats.above` is `rows.length`. `stats.highestMarketplace` is the largest marketplace estimate among valued names, including names under the floor. `stats.truncated` is true when `--max-values` left some prefilter names unvalued. The daily job refuses to publish that file.

## Page

The page is [accompli.sh/premium-domains](https://accompli.sh/premium-domains). `web/` is that static page, in the same black and white as the other Accomplish tools. The wordmark on the page links to [accompli.sh](https://accompli.sh). The page reads the raw `data/results.json` URL above, then falls back to a relative `results.json`, and draws the table. It does not send a bid. GitHub Pages is not used.

## Limits

The dictionary is an English word list, not a brand book. A rare word of eight letters can pass the prefilter and still be worth nothing. A coined name that is not in the list is dropped even when a person would want it. Two words glued together pass only when the whole label is itself in the list.

Prices stay in the feed's currency. The floor is always the HumbleWorth marketplace number, in dollars. A 20 EUR auction and an 83000 dollar estimate are different facts, and both are printed.

The model was trained through early 2024. It does not know a trademark. It does not know that the feed's price is a reserve you cannot see. A row above the floor can still be a bad purchase. A row missing from the list can still be a good one.

Do not commit `.env`. Keys stay in the environment, or in GitHub Actions secrets for the daily job.
