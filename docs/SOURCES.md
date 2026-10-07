# Sources

Each source is an adapter in `src/sources`. `--sources` selects a subset. An adapter that is off by default stays off until you name it.

The prefilter runs before a name is kept from a large feed. The label is `a-z` only. On `.com`, `.co`, `.io`, `.sh`, `.ly`, `.org`, `.net`, `.to`, `.gg`, `.ai`, `.me`, `.pro`, `.xyz`, and `.app`, one to six letters pass. A longer label on those extensions passes when it is in `data/words.txt` (plus `data/extra.txt`), when it is two dictionary words, or when it is seven or eight letters with consonants and vowels alternating. A three-letter piece of a compound has to be in `data/common.txt`. On any other TLD, one to four letters pass, and a longer label passes only as a dictionary word. Hyphens, digits, and extra dots are out. `--tlds` is optional. When it is omitted, the rule above is what runs. `--max-length` defaults to 16.

park.io does not use that dictionary. The adapter reads every current auction page, every per-TLD drop list, and every per-TLD premium drop list, then keeps letter-only labels up to 24 characters. Digits and hyphens are left out. A drop row has `listingType` `drop` and `auctionEnd` set to the available date. An auction row has `listingType` `auction`.

Atom is the same kind of exception. The public HTML pages are already a curated catalog, so letter-only labels up to 24 characters are kept on every TLD those pages list.

## What the live checks showed

Checked from this repository's network on 7 October 2026.

| Id          | Feed                                                                                                                                                               | Live result                                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parkio`    | `https://park.io/auctions.json`, `https://park.io/domains/index/{tld}.json`, `https://park.io/premium-domains/index/{tld}.json`                                    | JSON, paginated. Auctions include a price and a close stamp. Drop lists and premium drop lists include an available date and no price. The TLD set is read from the public HTML and a fallback list.                                                                                                              |
| `dynadot`   | Public CSV for expired auctions, user auctions, pre-expiry auctions, and `/market/backorder/backorders.csv`                                                        | Auction files include a bid and an end timestamp. The backorder file is a drop list. The last-chance URL was not a CSV.                                                                                                                                                                                           |
| `godaddy`   | `https://inventory.auctions.godaddy.com/` inventory files                                                                                                          | `metadata.json` lists the files. The adapter reads the no-adult expiring CSV zip and the closeout JSON zip. No key.                                                                                                                                                                                               |
| `sedo`      | `https://sedo.com/txt/auctions_us.txt` and `topdomains_{us,d,e,fr,es}.txt`                                                                                         | The auction file is one complete list, about 17,000 rows, not a paged catalog. `auctions_de.txt`, `auctions_e.txt`, `auctions_fr.txt`, and `auctions_es.txt` start with the same rows, so they are not fetched again. Locale top lists are fetched. There is no public file of the full Sedo buy-now marketplace. |
| `atom`      | `https://www.atom.com/premium-domains-for-sale`, `/ai-domains-for-sale`, `/ultra-premium-marketplace`, `/aged-domains`, `/aftermarket-domains`, `/expired-domains` | Public HTML, no login. Premium is about 102 pages and the `.ai` list is about 100 pages. Each card has a domain and an asking price.                                                                                                                                                                              |
| `namejet`   | `https://www.namejet.com/download.action?format=csv`                                                                                                               | The index lists `file_dl.sn` CSV links. Downloading those files returned HTTP 403 (Cloudflare). A different Accept header can instead get an error page.                                                                                                                                                          |
| `snapnames` | `https://www.snapnames.com/download.action?format=csv`                                                                                                             | HTTP 403 from this network. NameJet and SnapNames share an inventory.                                                                                                                                                                                                                                             |
| `dropcatch` | `POST https://api.dropcatch.com/Authorize`, then `GET /v2/downloads/auctions/AllAuctions?fileType=Csv`                                                             | Not called without keys. The interactive docs are at `https://api.dropcatch.com/documentation`.                                                                                                                                                                                                                   |
| `afternic`  | none                                                                                                                                                               | Off. Afternic does not publish a public catalog. Buyer search is delegated to GoDaddy.                                                                                                                                                                                                                            |

A feed that fails is a loud warning. The run keeps the feeds that worked.

The Dynadot closeout path and the last-chance path were not a CSV on this check, so they are not in the adapter. The backorder CSV is. Dynadot's account API (`get_open_auctions` and the rest) needs a key and, for auctions, an extra approval. This program does not call it.

## Keys

Read from the environment. Do not commit them. A missing optional key skips that source with a note.

| Variable                  | Source                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `REPLICATE_API_TOKEN`     | HumbleWorth hosted model. Used only when `HUMBLEWORTH_BACKEND=replicate`.                               |
| `DROPCATCH_CLIENT_ID`     | DropCatch API client id.                                                                                |
| `DROPCATCH_CLIENT_SECRET` | DropCatch API client secret.                                                                            |
| `AFTERNIC_FEED_URL`       | Optional CSV you are allowed to read. Turns the Afternic adapter on when you pass `--sources afternic`. |

Create the DropCatch client at `https://www.dropcatch.com/account/api-management`. The adapter sends `clientId` and `clientSecret` to `/Authorize` and then downloads `AllAuctions` as CSV.

## HumbleWorth

The estimate this list uses is the marketplace figure. HumbleWorth's own docs define it as the direct marketplace sale, the 97.5th percentile of the model. Auction is the 50th percentile. Brokerage is the 99.25th percentile. The floor applies to marketplace only.

The default backend is the published `humbleworth/price-predict-v1` checkpoint, run here on CPU. Replicate's model page describes that network (MiniLM encoders, a small prediction head, and a tanh price curve) and publishes the image at `r8.im/humbleworth/price-predict-v1`. Version `a925db842c707850e4ca7b7e86b217692b0353a9ca05eb028802c4a85db93843` is public without a token. `model/humbleworth/value.py` downloads the layer that holds the weights and caches them under `~/.cache/premium-domains/humbleworth-price-predict-v1` (or `PREMIUM_DOMAINS_MODEL_DIR`).

Hugging Face has `humbleworth/domain-mlm`, `humbleworth/tld-embedding`, and `humbleworth/reformer-character-domain-generator`. None of those is this price head. The head weights are only in the image.

Install the CPU runtime once:

```bash
pip install -r model/requirements.txt
python3 model/humbleworth/value.py --warm
```

`HUMBLEWORTH_BACKEND=replicate` uses the hosted model instead.

- Endpoint: `POST https://api.replicate.com/v1/models/humbleworth/price-predict-v1/predictions`
- Auth: `Authorization: Bearer` and `REPLICATE_API_TOKEN`
- Input: `{ "input": { "domains": "cedar.co,river.co" } }`
- Batch: up to 2560 names
- Price on Replicate: about $0.10 per 1000 predictions, billed by Replicate
- Docs: `https://humbleworth.com/about/api`

The response object has `valuations[]` with `domain`, `auction`, `marketplace`, and `brokerage`. A Replicate prediction wraps that object in `output`. The parser accepts both.

The older host `valuation.humbleworth.com` does not complete a TLS handshake from this network. `POST https://humbleworth.com/api/valuation` returns HTTP 429 with a Vercel challenge, not a valuation. The free page at `https://humbleworth.com/valuation/bulk` is for a browser session. This program does not solve that challenge.

Estimates are cached in `--cache` for `--cache-days` (7). A repeated daily run does not revalue a name that was valued inside that window. The daily workflow restores `results/cache.json` from the Actions cache and saves a new key each run.

The model card says the training data runs through early 2024, the model is fit to English names, and it does not score trademark risk. A marketplace estimate is not an appraisal and not a bid.

## Daily run

`.github/workflows/daily.yml` runs at 15:45 UTC, after GoDaddy's inventory refresh window, and on `workflow_dispatch`. The workflow sets `permissions: contents: write`. It installs `model/requirements.txt`, restores the weight cache at `~/.cache/premium-domains/humbleworth-price-predict-v1`, and values up to 550000 prefiltered names (`--max-values 550000`, `--cache-days 7`). The listed extensions are valued first. The local model does not stop at the hosted batch size of 2560.

The job uploads `results/` as an artifact. When the run exits 0, `generatedAt` is set, at least one name was valued, and the run was not truncated, it writes that payload to `data/results.json` and `web/results.json`, copies it to `data/history/YYYY-MM-DD.json`, refreshes `data/history/index.json`, and merges `data/archive.json`. It commits and pushes those paths only when they changed. It does not delete history files. `REPLICATE_API_TOKEN` is optional. If valuation fails the job exits 3 and commits nothing. The artifact still contains the envelope, including which feeds failed. `--max-values 550000` is above the prefilter size from the 7 October 2026 scan, so those extensions are not cut. The job limit is 180 minutes. The valuation cache means a later day values only names that were not valued in the last 7 days.

Dynadot's public CSV set includes expired auctions, user auctions, pre-expiry auctions, and backorders. The last-chance URL was not a CSV, so it is not fetched. GoDaddy's public inventory already includes the no-adult expiring auctions and the closeout file. The other files in `metadata.json` are the same auctions in another format, including adult inventory, so they are not added.

## Feeds that were not added

Checked from this repository's network on 7 October 2026. Nothing here was fetched by solving a login or a bot check.

| Place                    | Why it is not a source                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sedo buy-now marketplace | The public partner files are the auction list and the short top lists. `auctions_us.txt` is the full auction file. Locale auction files repeat it. |
| Afternic                 | No public catalog. Dan.com redirects to Afternic. The adapter stays off unless `AFTERNIC_FEED_URL` is set.                                         |
| Namecheap Market         | The auctions page and the guessed export URLs returned HTTP 403. `aftermarketapi.namecheap.com` returned HTTP 401.                                 |
| Spaceship                | The marketplace page returned HTTP 403.                                                                                                            |
| Sav                      | `https://v2.sav.com/domains/auctions` is a client shell. `https://api.v2.sav.com/auctions` and the nearby paths returned HTTP 404.                 |
| NameSilo marketplace     | HTTP 403.                                                                                                                                          |
| GoDaddy domain search    | HTTP 403.                                                                                                                                          |
| HugeDomains              | The public sitemap lists site pages, not the domain catalog.                                                                                       |
| BrandBucket              | The search page HTML does not contain the inventory.                                                                                               |
| NameJet and SnapNames    | HTTP 403, as in the table above.                                                                                                                   |
| DropCatch                | The auction download needs API keys.                                                                                                               |

The public file is `https://raw.githubusercontent.com/accomplish999/premium-domains/main/data/results.json`. The schema is in the README.
