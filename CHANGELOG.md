# Changelog

## 0.1.0

First public release.

Public feeds for park.io, Dynadot, GoDaddy Auctions, and Sedo. NameJet, SnapNames, DropCatch, and Afternic are wired and documented, including the ones that do not answer without a key or do not currently serve a file.

HumbleWorth marketplace estimates come from the published `price-predict-v1` weights, run on CPU. `HUMBLEWORTH_BACKEND=replicate` keeps the hosted model. The floor is 25000 dollars. Output is a table, CSV, and JSON, with a new-since-last-run set.

The page is https://accompli.sh/premium-domains. GitHub Pages is not used.

The published list is `data/results.json` (the same bytes as `web/results.json`). The daily job values every prefiltered name with the local model, caches the weights, and pushes that file when it changed.

park.io now reads every published drop TLD and every premium drop page, and values letter-only names from those lists. `data/history/` keeps each day's file. `data/archive.json` keeps every domain that has cleared the floor.

The prefilter keeps short letter-only labels, dictionary words, two-word compounds, and alternating 7 and 8 letter patterns on every TLD. Atom's public premium and `.ai` pages are a source. Valuation estimates are cached for 7 days.
