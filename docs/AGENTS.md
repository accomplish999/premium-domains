# Agents

## Envelope

`--json` prints one object on stdout.

```json
{
  "ok": true,
  "tool": "scan",
  "warnings": [{ "code": "CANDIDATES_TRUNCATED", "severity": "note", "message": "..." }],
  "result": {
    "generatedAt": "2026-10-07T15:00:00.000Z",
    "threshold": 25000,
    "rows": [],
    "newRows": [],
    "sources": [],
    "stats": {
      "fetched": 0,
      "kept": 0,
      "valued": 0,
      "above": 0,
      "highestMarketplace": null,
      "truncated": false
    }
  }
}
```

`rows` is the list. Every row is above `threshold` on `marketplace`. Names at the threshold are not included. `newRows` is the subset whose domain was absent from `results/state.json` at the start of the run.

`stats.highestMarketplace` is the largest marketplace estimate among the names that were valued, including names that did not clear the floor. The domain that produced it is not listed. The table does not contain it unless it cleared the floor.

## Exit codes

| Code | When                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------ |
| 0    | `ok` is true, and either there is no loud warning or `--strict` is off.                          |
| 2    | The command line is wrong. `ok` is false. The message is on stderr. The envelope is on stdout.   |
| 3    | `ok` is false, or `--strict` is on and a warning has severity `loud`. The body is still printed. |
| 1    | The process threw something that is not an input error.                                          |

A source that returns HTTP 500 is a loud `SOURCE_FAILED` warning. The other sources still contribute rows. Exit 0 unless `--strict`.

A valuation that does not run is `ok: false` and exit 3. `rows` is empty. No name is printed as if it had cleared the floor.

## Row

| Field          | Meaning                                                               |
| -------------- | --------------------------------------------------------------------- |
| `domain`       | Lower case, one label and one TLD.                                    |
| `source`       | The feed that supplied the price and the end time.                    |
| `alsoSeenOn`   | Other feeds that had the same domain in this run.                     |
| `price`        | Current bid or asking price, or null when the feed has no number.     |
| `currency`     | As the feed labeled it. Not converted.                                |
| `auctionEnd`   | ISO time. For a park.io drop this is the available date at 00:00 UTC. |
| `marketplace`  | HumbleWorth marketplace estimate, USD. This is the floor.             |
| `auctionValue` | HumbleWorth auction estimate, USD.                                    |
| `brokerage`    | HumbleWorth brokerage estimate, USD.                                  |
| `link`         | A page for the listing.                                               |
| `listingType`  | `auction`, `buy_now`, `closeout`, `dropping`, or `marketplace`.       |

## State

After a successful valuation, the domains in `rows` replace the previous state file. The first successful run marks every row as new. A later run marks a domain new only when it was not in that file.
