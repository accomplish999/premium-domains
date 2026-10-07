# Agents

This repo lists domains. It does not bid, and it does not register a name. Do not treat a row as a signal.

Use `--json`. Read `ok`, then `warnings`, then `result`. A loud warning can still be a finished list. Exit 0 means the run finished and strict mode was off, or there was no loud warning. It does not mean an estimate is a price you should pay.

```bash
npx tsx src/cli.ts scan --listings examples/listings.json --values examples/values.json --json
npx tsx src/cli.ts sources --json
```

The fixture files are not HumbleWorth output. A live run calls the network.

Marketplace threshold: the name is kept only when the HumbleWorth marketplace estimate is above the number. `25000` means 25000 dollars. It does not mean 25.

Full field list, exit codes, and the JSON envelope: [docs/AGENTS.md](docs/AGENTS.md).
Sources and the valuation call: [docs/SOURCES.md](docs/SOURCES.md).
Flags: [docs/CLI.md](docs/CLI.md).
