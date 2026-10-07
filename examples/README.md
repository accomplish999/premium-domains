# Examples

`listings.json` and `values.json` are fixtures. The marketplace numbers are not HumbleWorth output. They exist so `npm run smoke` can run the filter, the dedupe, and the threshold with the network off.

```bash
npx tsx src/cli.ts scan --listings examples/listings.json --values examples/values.json --json
```

`cedar.co` is the only row. The estimate is above 25000. `pebble.co` is below it. `blue-gas.com` has a hyphen, so the prefilter drops it before the estimate is consulted.
