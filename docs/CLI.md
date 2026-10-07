# CLI

```bash
npx tsx src/cli.ts scan --json
npx tsx src/cli.ts sources
npx tsx src/cli.ts --help
```

Node 20 or newer.

## scan

| Flag           | Default              | Meaning                                                                                                                                                                                                    |
| -------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json`       | off                  | Print the envelope instead of the table.                                                                                                                                                                   |
| `--strict`     | off                  | Exit 3 when any warning is loud.                                                                                                                                                                           |
| `--new`        | off                  | The text table is `newRows` only. JSON still has both lists.                                                                                                                                               |
| `--threshold`  | `25000`              | Keep a name only when marketplace is above this many dollars.                                                                                                                                              |
| `--tlds`       | `com,co,io,ai`       | Premium TLDs. A leading dot is ignored.                                                                                                                                                                    |
| `--min-length` | `1`                  | Minimum letters in the label.                                                                                                                                                                              |
| `--max-length` | `10`                 | Maximum letters in the label.                                                                                                                                                                              |
| `--max-values` | `500`                | How many prefiltered names to value. Shortest first, then `.com`, `.co`, `.io`, `.ai`, then common English words before rarer dictionary words. The daily job passes `100000` so the prefilter is not cut. |
| `--sources`    | the default set      | Comma-separated ids. Replaces the default set.                                                                                                                                                             |
| `--out`        | unset                | Directory for `latest.json`, `latest.csv`, `new.csv`, and `web-results.json`.                                                                                                                              |
| `--state`      | `results/state.json` | Domains that cleared the floor on the previous successful run.                                                                                                                                             |
| `--cache`      | `results/cache.json` | HumbleWorth responses. A hit newer than `--cache-days` is not requested again.                                                                                                                             |
| `--cache-days` | `14`                 | Age after which a cached estimate is requested again.                                                                                                                                                      |
| `--listings`   | unset                | JSON array of listings. Skips every source.                                                                                                                                                                |
| `--values`     | unset                | JSON object of estimates, keyed by domain. Skips HumbleWorth.                                                                                                                                              |

`PREMIUM_DOMAINS_THRESHOLD` and `PREMIUM_DOMAINS_MAX_VALUES` override those two defaults when the flag is absent.

`HUMBLEWORTH_BACKEND` is `local` unless you set `replicate`. The local backend runs the published price-predict-v1 weights on CPU. The replicate backend needs `REPLICATE_API_TOKEN`. `PREMIUM_DOMAINS_MODEL_DIR` moves the weight cache. `PYTHON` selects the interpreter.

## sources

Prints each adapter, whether it is on by default, and which environment variables it reads. `--json` wraps that list in the envelope with `tool` set to `sources`.

## Text table

Columns are domain, source, price, ends, marketplace, link. A second feed for the same domain is appended to the source cell with `+`. The price is the feed's price. It is not converted to dollars. The marketplace column is the HumbleWorth marketplace estimate, in dollars.

Empty output is a finished run when nothing cleared the floor. Read `highest marketplace` in the text footer, or `stats.highestMarketplace` in JSON, before you decide the feeds were empty.
