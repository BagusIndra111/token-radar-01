# Pulse — Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/BagusIndra111/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/BagusIndra111/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Pulse ranks the protocols that record no token by what their token would be worth — TVL × 0.30, moved by 7-day growth, age with no token, category and chain count — and gives each one a five-step farm plan with costs and times. The board covers the whole watchlist (40 protocols at or above $50M TVL with no token) plus the smaller pre-token protocols below the floor, 198 ranked in all. A live-token strip shows what a launch can become, for comparison.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../../token-radar-01-kit/input/snapshot.json
```

Then open `out/dashboard/index.html` in a browser (it reads `out/data.js`, no network). Or serve the built output:

```sh
node serve.ts
```

and open http://localhost:8080/dashboard/ (serve.ts serves `out/`; run `main.ts` first so it exists).

## How it works

- `main.ts` reads the sealed DefiLlama snapshot, scores every protocol that could still launch, writes `board.json` (ranked rows with farm steps) and `data.js`, and copies `dashboard/` and `screenshots/` into `out/` with a `dossier.json` built by the vendored make.fun library.
- `lib/model.ts` holds the value model and the farm-step generator.
- `dashboard/` is a static page: board, detail view per protocol, filters (search, category, chain, scope, TVL, sort) and a live-token comparison strip. State lives in the URL (`?slug=`, `?scope=watchlist`, …).

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?ref=pqve0qe3&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
