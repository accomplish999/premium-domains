# Sources

Each source is an adapter in `src/sources`. `--sources` selects a subset. An adapter that is off by default stays off until you name it.

The prefilter runs before a name is kept from a feed. The label is `a-z` only. One or two letters pass. Three to `--max-length` letters pass only when the label is in `data/words.txt` (plus `data/extra.txt`). The TLD is one of `--tlds`. Hyphens, digits, and extra dots are out. That is the cheap pass. It is there so the valuation call stays small.

## What the live checks showed

Checked from this repository's network on 7 October 2026.

| Id          | Feed                                                                                                                                                | Live result                                                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parkio`    | `https://park.io/auctions.json`, `https://park.io/domains/index/{tld}.json`, `https://park.io/premium-domains.json`                                 | JSON returned. Auctions include price and a close stamp. Drops and the premium list include an available date and no price.                                             |
| `dynadot`   | Public CSV under `/market/auction/auctions.csv`, `/market/user-auction/user_auctions.csv`, and `/market/pre-expiry-auction/pre_expiry_auctions.csv` | CSV returned, with a bid and an end timestamp.                                                                                                                          |
| `godaddy`   | `https://inventory.auctions.godaddy.com/` inventory files                                                                                           | `metadata.json` lists the files. The adapter reads the no-adult expiring CSV zip and the closeout JSON zip. No key.                                                     |
| `sedo`      | `https://sedo.com/txt/auctions_us.txt` and `https://sedo.com/txt/topdomains_us.txt`                                                                 | Partner text feeds returned. Auction lines are semicolon-separated. The top list uses `~` and a thousands dot, so `54.000 EUR` is 54000 EUR. `Make offer` has no price. |
| `namejet`   | `https://www.namejet.com/download.action?format=csv`                                                                                                | The index lists `file_dl.sn` CSV links. Downloading those files returned HTTP 403 (Cloudflare). A different Accept header can instead get an error page.                |
| `snapnames` | `https://www.snapnames.com/download.action?format=csv`                                                                                              | HTTP 403 from this network. NameJet and SnapNames share an inventory.                                                                                                   |
| `dropcatch` | `POST https://api.dropcatch.com/Authorize`, then `GET /v2/downloads/auctions/AllAuctions?fileType=Csv`                                              | Not called without keys. The interactive docs are at `https://api.dropcatch.com/documentation`.                                                                         |
| `afternic`  | none                                                                                                                                                | Off. Afternic does not publish a public catalog. Buyer search is delegated to GoDaddy.                                                                                  |

A feed that fails is a loud warning. The run keeps the feeds that worked.

Closeout, backorder, and last-chance CSV paths on Dynadot answered with a bot check or a 404 during the same check, so they are not in the adapter. The three CSV files above are the Dynadot source. Dynadot's account API (`get_open_auctions` and the rest) needs a key and, for auctions, an extra approval. This program does not call it.

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
- Input: `{ "input": { "domains": "thesis.co,compound.co" } }`
- Batch: up to 2560 names
- Price on Replicate: about $0.10 per 1000 predictions, billed by Replicate
- Docs: `https://humbleworth.com/about/api`

The response object has `valuations[]` with `domain`, `auction`, `marketplace`, and `brokerage`. A Replicate prediction wraps that object in `output`. The parser accepts both.

The older host `valuation.humbleworth.com` does not complete a TLS handshake from this network. `POST https://humbleworth.com/api/valuation` returns HTTP 429 with a Vercel challenge, not a valuation. The free page at `https://humbleworth.com/valuation/bulk` is for a browser session. This program does not solve that challenge.

Estimates are cached in `--cache` for `--cache-days` (14). A repeated daily run does not revalue a name that was valued inside that window.

The model card says the training data runs through early 2024, the model is fit to English names, and it does not score trademark risk. A marketplace estimate is not an appraisal and not a bid.

## Daily run

`.github/workflows/daily.yml` runs at 15:45 UTC, after GoDaddy's inventory refresh window, and on `workflow_dispatch`. It uploads `results/` as an artifact. When the run exits 0 it commits `results/latest.json`, `results/latest.csv`, `results/new.csv`, `results/state.json`, and `web/results.json`.

The job installs `model/requirements.txt`, caches the weights, and runs the local model. `REPLICATE_API_TOKEN` is optional. If valuation fails the job exits 3 and commits nothing. The artifact still contains the envelope, including which feeds failed.
