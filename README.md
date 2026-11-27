# ToggleTruth

Independent experiment integrity checks for self-hosted Flagsmith.

A Flagsmith dashboard can show a confident win probability on an experiment whose
traffic split is broken and whose identities were contaminated. ToggleTruth reads the
experiment results from **your** self-hosted Flagsmith, recomputes the statistics
independently, and returns a verdict you can put in a CI gate.

## What it does

- `check` — audits one experiment and returns `TRUSTWORTHY`, `INCONCLUSIVE` or `INVALID`.
- `preflight` — estimates the traffic an experiment needs before you start it.

The verdict is based on checks that upstream Flagsmith itself implements:

| Check | Source |
|---|---|
| Lift, 95% interval, chance to win (delta method) | `api/experimentation/stats.py::compare_to_control` |
| Sample ratio mismatch (chi-squared survival) | `api/experimentation/stats.py::srm_p_value` |
| Quarantined identities exposed to multiple variants | `api/experimentation/results_query.py::exposures_cte` |

Ported at Flagsmith commit `f4de7145` (v2.295.2). See `docs/ISSUE-ANALYSIS.md`.

## Install

Requires Node 20 or newer.

```bash
npm install -g toggletruth
```

From source:

```bash
git clone https://github.com/saswatdutta1310/toggletruth.git
cd toggletruth
npm install
npm run check       # typecheck, build, 18 tests
npm link
```

## Run

```bash
# Against your self-hosted Flagsmith
toggletruth check \
  --api-url http://localhost:8000 \
  --token "$FLAGSMITH_TOKEN" \
  --environment <environment-api-key> \
  --experiment 7
```

The token is read from your environment; it is only placed in an outbound
`Authorization: Token …` header. It is never logged, printed or written to disk.

```
VERDICT: INVALID
flag: invite_cta  as of 2026-11-27T18:00:00Z

  sample ratio mismatch p : <1e-6
  quarantined identities   : 312

  - Sample ratio mismatch: p=<1e-6 (threshold 0.001). The traffic split does not match the configured weights.
  - 312 identities were exposed to more than one variant and were quarantined.
```

Add `--json` for machine-readable output.

### Deterministic demo (no server needed)

```bash
toggletruth check --demo --scenario broken   # exit 1, INVALID
toggletruth check --demo --scenario fixed    # exit 0, TRUSTWORTHY
```

### Preflight

```bash
toggletruth preflight --baseline 0.05 --mde 0.1 --traffic 400 --days-until 2
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | TRUSTWORTHY |
| 1 | INVALID, or a client/API error |
| 2 | INCONCLUSIVE, or missing arguments |

This makes the command usable as a CI gate. `action.yml` wraps it for GitHub Actions.

## How Flagsmith is core

ToggleTruth has no independent data source. It calls these management API endpoints:

- `GET /api/v1/environments/{key}/experiments/{id}/results/`
- `GET /api/v1/environments/{key}/experiments/{id}/exposures/`

Both are documented in the checked-in `openapi.yaml` of Flagsmith. The verdict engine
reproduces upstream formulas so an audit agrees with the platform by construction.
Remove Flagsmith and the tool has nothing to audit.

## Limitations

- Upstream declares the results `payload` as generic JSON. ToggleTruth adapts the
  common shapes and **fails loudly with the observed keys** on anything else; it never
  guesses numbers. Please open an issue with those keys if your shape differs.
- `normalCdf` uses Abramowitz & Stegun 7.1.26 (max error ~1.5e-7), which is why the
  ported chance-to-win can differ from Python's `NormalDist` in the seventh decimal.
- Preflight is a normal-approximation estimate, not a power analysis.
- This is a gate, not a replacement for reading the result. An interval crossing zero
  stays inconclusive no matter how green the dashboard looks.

See `DISCLOSURE.md` for scope, data handling and AI-ass disclosure.

## Development

```bash
npm install
npm run check        # typecheck -> build -> tests
npm run demo         # broken scenario
```

Tests are colocated with source and run from `dist/`. Source files import with explicit
`.js` extensions (NodeNext). Runtime dependencies: none; Node built-ins only.

## Licence

MIT. Copyright (c) 2026 Saswat Dutta.
