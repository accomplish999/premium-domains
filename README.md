# premium-domains

[![Accomplish](web/wordmark.png)](https://accompli.sh/premium-domains)

Public feeds list far more names than clear a valuation floor. This tool reads those feeds, drops the names that would make the model call large, and keeps the names whose HumbleWorth marketplace estimate is above the floor. The floor is 25000 dollars unless you pass another one. Each run replaces today's file. Older runs stay on disk, so the distribution can be read again later.

The scan in the committed `data/results.json` (`generatedAt` 2026-10-07T20:25:29.732Z) read 3,740,996 feed rows. It valued 500,000 of the 515,692 names that passed the prefilter. 748 were above $25,000.

The cheap pass is letters only. On `.com`, `.co`, `.io`, `.sh`, `.ly`, `.org`, `.net`, `.to`, `.gg`, `.ai`, `.me`, `.pro`, `.xyz`, and `.app`, a label of one to six letters passes on length. A longer label on those extensions passes when it is in the word list, when it is two dictionary words joined together, or when it is seven or eight letters that alternate consonant and vowel. A three-letter piece of a compound has to be a common English word. On any other TLD, one to four letters pass, and a longer label passes only when it is in the word list. Digits, hyphens, and extra dots stay out. `--tlds` can still limit the large feeds. park.io and Atom are curated lists, so every letter-only name on those lists is valued, up to 24 letters.

This is a list. It is not a bid, and it is not an appraisal. An estimate is a model. Past sales do not set the next sale.

## Contents

- [What is listed](#what-is-listed)
- [The floor](#the-floor)
- [Feeds](#feeds)
- [Output](#output)
- [Daily run](#daily-run)
- [Published file](#published-file)
- [History](#history)
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

`HUMBLEWORTH_BACKEND=replicate` keeps the hosted model as an option. That path needs `REPLICATE_API_TOKEN`. One hosted request takes up to 2560 names and Replicate bills about $0.10 per 1000 predictions. `--max-values` defaults to 500. The estimate cache lasts 7 days. The free page on humbleworth.com answers this network with a bot challenge, and the older valuation host does not complete TLS. The program does not try to get around either of those. Details are in [docs/SOURCES.md](docs/SOURCES.md).

## Feeds

| Id          | What it reads                                             | Key                                                                  |
| ----------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| `parkio`    | Live auctions, per-TLD drop lists, and premium drop lists | none                                                                 |
| `dynadot`   | Expired, user, pre-expiry, and backorder CSV              | none                                                                 |
| `godaddy`   | Inventory Protocol zip files                              | none                                                                 |
| `sedo`      | Public auction file and locale top-name lists             | none                                                                 |
| `atom`      | Public premium, .ai, aged, aftermarket, and expired pages | none                                                                 |
| `namejet`   | Official download page                                    | none. The index lists CSV files. Those downloads returned HTTP 403.  |
| `snapnames` | Official download page                                    | none, and the page was HTTP 403                                      |
| `dropcatch` | Official auction CSV download                             | `DROPCATCH_CLIENT_ID`, `DROPCATCH_CLIENT_SECRET`                     |
| `afternic`  | A CSV you supply                                          | off unless you set `AFTERNIC_FEED_URL` and pass `--sources afternic` |

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

`.github/workflows/daily.yml` runs at 15:45 UTC and when you start it by hand. GoDaddy refreshes the inventory files in the hour before that. The job has `permissions: contents: write`. It caches the HumbleWorth weight layer and the valuation cache. A name valued in the last 7 days is not sent to the model again. The job values up to 550000 prefiltered names. `.com`, `.co`, `.io`, `.sh`, `.ly`, `.org`, `.net`, `.to`, `.gg`, `.ai`, `.me`, `.pro`, `.xyz`, and `.app` are valued first. It uploads `results/` as an artifact.

When the process exits 0 and the file has a `generatedAt`, at least one valued name, and `stats.truncated` false, the job writes `data/results.json`, `web/results.json`, `data/history/YYYY-MM-DD.json`, `data/history/index.json`, and `data/archive.json`. It commits and pushes those paths only when the bytes changed. It does not delete history files. A failed valuation commits nothing. The artifact still holds the envelope so you can see which feeds answered.

The job values names with the local model. A `REPLICATE_API_TOKEN` secret is optional, and it is used only when `HUMBLEWORTH_BACKEND` is `replicate`. No token is required for the scheduled run.

## Published file

The list the page draws is [data/results.json](data/results.json). The same bytes are in `web/results.json`, which is what a relative fetch reads. The stable public URL is:

https://raw.githubusercontent.com/accomplish999/premium-domains/main/data/results.json

`generatedAt` is an ISO-8601 time. `threshold` is the marketplace floor in dollars. `rows` is every valued name strictly above that floor, highest marketplace first. `stats` counts the run.

| Field          | Meaning                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| `domain`       | Lower case, one label and one TLD.                                                      |
| `marketplace`  | HumbleWorth marketplace estimate, USD. This is the number compared with `threshold`.    |
| `source`       | The feed that supplied the price and the end time.                                      |
| `link`         | Listing or auction URL.                                                                 |
| `price`        | Current bid or asking price, or null when the feed has no number.                       |
| `currency`     | As the feed labeled it. Not converted.                                                  |
| `auctionEnd`   | Auction end, or the drop date, as an ISO time. Null when the feed has none.             |
| `listingType`  | `drop`, `auction`, or `buynow`. A park.io drop puts the available date in `auctionEnd`. |
| `auctionValue` | HumbleWorth auction estimate, USD.                                                      |
| `brokerage`    | HumbleWorth brokerage estimate, USD.                                                    |
| `alsoSeenOn`   | Other feeds that had the same domain in this run.                                       |

`stats.fetched` is rows read from the feeds. `stats.kept` is names that passed the prefilter. `stats.valued` is how many of those received a HumbleWorth estimate. `stats.above` is `rows.length`. `stats.highestMarketplace` is the largest marketplace estimate among valued names, including names under the floor. `stats.truncated` is true when `--max-values` left some prefilter names unvalued. The daily job refuses to publish that file.

## History

`data/history/YYYY-MM-DD.json` is a copy of that day's `results.json`. The daily job overwrites the file when the run falls on the same date. It does not delete older dates.

`data/history/index.json` is the list of those dates, newest first:

```json
{ "dates": ["2026-10-08", "2026-10-07"] }
```

The public URL is https://raw.githubusercontent.com/accomplish999/premium-domains/main/data/history/index.json

`data/archive.json` keeps every domain that has ever been above the floor. A name is not removed when it leaves the feeds. The public URL is https://raw.githubusercontent.com/accomplish999/premium-domains/main/data/archive.json

| Field         | Meaning                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `generatedAt` | ISO time of the latest scan merged into the file.                                                        |
| `threshold`   | Marketplace floor in dollars.                                                                            |
| `rows`        | One object per domain that has cleared the floor at least once.                                          |
| `firstSeen`   | First UTC date the domain was above the floor, `YYYY-MM-DD`.                                             |
| `lastSeen`    | Latest UTC date it was above the floor.                                                                  |
| `active`      | True when the domain is in today's `results.json`.                                                       |
| `sightings`   | Number of distinct dates the domain was above the floor. A second run on the same date does not add one. |

Each row also has the fields from `results.json`: `domain`, `marketplace`, `source`, `link`, `price`, `currency`, `auctionEnd`, `listingType`, `auctionValue`, `brokerage`, and `alsoSeenOn`. A new sighting updates those from that run, including `marketplace`, `price`, and `link`. A domain that drops out keeps the values from its last sighting and sets `active` to false.

## Page

The page is [accompli.sh/premium-domains](https://accompli.sh/premium-domains). `web/` is that static page, in the same black and white as the other Accomplish tools. The wordmark on the page links to [accompli.sh](https://accompli.sh). The page reads the raw `data/results.json` URL above, then falls back to a relative `results.json`, and draws the table. It does not send a bid. GitHub Pages is not used.

## Limits

The dictionary is an English word list, not a brand book. A rare word of eight letters can pass the prefilter and still be worth nothing. A coined name of seven or eight letters passes when the consonants and vowels alternate. Two words glued together pass when both parts are dictionary words. A label of up to six letters passes on the listed extensions even when it is not a word. Other TLDs pass at up to four letters, or when the label is a dictionary word. The daily job stops at 550000 names so it finishes inside the Actions time limit. The extensions above are valued before other TLDs.

Prices stay in the feed's currency. The floor is always the HumbleWorth marketplace number, in dollars. A 20 EUR auction and an 83000 dollar estimate are different facts, and both are printed.

The model was trained through early 2024. It does not know a trademark. It does not know that the feed's price is a reserve you cannot see. A row above the floor can still be a bad purchase. A row missing from the list can still be a good one.

Do not commit `.env`. Keys stay in the environment, or in GitHub Actions secrets for the daily job.
