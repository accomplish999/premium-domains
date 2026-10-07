# Contributing

The tests are the spec for the parsers and the floor. If you change a feed's fields, update the test and [docs/SOURCES.md](docs/SOURCES.md) in the same change. If you change a default, update [docs/CLI.md](docs/CLI.md) and the help text too.

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run smoke
npm run links
npm run copy
```

Node 20 or newer. `npm run format` rewrites the files Prettier owns. `npm run copy` rejects an em dash or an en dash. `npm run links` checks relative links in the markdown.

Do not commit `.env`. Do not commit a Replicate token, a DropCatch secret, or a cache full of someone else's estimates.

The numbers in `examples/` are fixtures. If a change moves the fixture output, re-run the smoke command and update the example files from that output. Do not type a new estimate from memory and call it HumbleWorth.
