# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ainulalbab/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ainulalbab/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar: a Node program that reads a sealed snapshot of every protocol DefiLlama tracks, ranks the pre-token ones by an implied token value fitted from the market caps of protocols whose token already trades, and hands in a web dashboard with the board, a detail view for each protocol, and a filter. The board holds 246 rows — all 40 watchlist protocols plus 206 early pre-token protocols below the floor — each with an implied value and a concrete farm plan with costs and time. The dashboard is static, renders with no network, and recomputes every implied value from the fitted model.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=c0g8n0ya&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
