# ToggleTruth — the winning repro and execution plan

Prepared 2026-11-27, ~20:00 IST. Deadline 2026-11-29, 20:00 IST. **~48 hours left.**

This supersedes the earlier FlagOps TUI idea in `ANALYSIS.md`: the organisers published
that exact idea, so too many teams will build it. Keep `ANALYSIS.md` for the upstream
repo knowledge; the build target is now this document.

---

## Part 1 — Why this wins

### 1.1 What the research ruled out

I checked three things before choosing: the organisers' own idea list, the existing
Flagsmith GitHub ecosystem, and the general feature-flag tooling market.

**Published Track 03 ideas** (WeMakeDevs blog, 20 Nov 2026): flag-state dashboard,
starter template, log annotator, incident timeline, local override proxy, config diff.
The hackathon page also lists a terminal dashboard, one-command Docker setup, and an
admin-panel plugin. **A plain TUI is a published idea — it is the crowded option.**

**Existing Flagsmith ecosystem** (GitHub org, live listing): `terraform-provider-flagsmith`,
`flagsmith-backstage-plugin`, `n8n-nodes-flagsmith`, `flagsmith-jira-integration`,
`self-hosted`, `flagsmith-admin-client`, `flagsmith-realtime-example`,
`audit-log-webhook-examples`, `warehouse-delivery`, `flagsmith-cli`, `flagsmith-mcp`.
Integrations are not a blank field.

**Existing general tooling:** FlagShark (stale flags in PRs), bye-bye-flag (AI stale-flag
removal), LaunchDarkly/GrowthBook/ConfigCat code-reference scanners, GO Feature Flag
lint, OpenFeature typed accessors. **A generic flag linter is also not unique.**

What none of these do: **independently verify whether a Flagsmith experiment's result
can be trusted.**

### 1.2 The gap exactly where the judges are looking

The organisers' "How to Win Toggle Wars" post lists four wiring mistakes that silently
invalidate a result — unstable identifier, one-sided exposures, exposures rising while
conversions stay flat, late boolean-to-multivariate conversion. It then says the
winning Track 01 entries will be separated by reading the result honestly: win
probability is not a verdict, the credible interval must be read, and you should decide
traffic before starting.

Upstream Flagsmith already implements the machinery to detect two of these:
`api/experimentation/stats.py` has `compare_to_control()` (delta-method lift, 95%
credible interval, chance-to-win) and `srm_p_value()` (chi-squared sample-ratio-mismatch
test). `api/experimentation/results_query.py` quarantines identities that were exposed
to more than one distinct variant.

**ToggleTruth turns those upstream guarantees into an independent, reusable auditor.**
It is the tool you wished existed while setting up an experiment: something that tells
you, before you ship the winner, whether the winner is real.

### 1.3 The one-sentence project

> ToggleTruth connects to a self-hosted Flagsmith instance, independently recomputes
> an experiment's statistics from its results payload, and returns a verdict —
> TRUSTWORTHY, INCONCLUSIVE or INVALID — with the checks that justify it, as a CLI,
> a JSON CI gate and a GitHub Action.

### 1.4 Scorecard mapping — why a judge marks this high

| Criterion | How ToggleTruth scores |
|---|---|
| **Use of Flagsmith** | Flagsmith is the mechanism, not a wrapper. The tool cannot exist without a live self-hosted instance: it reads environments, experiments, feature variants and the results payload through the management API. Delete Flagsmith and the project is an empty statistics library. |
| **Impact** | A real, painful, specific job: stop a team shipping a false winner. Small tool, completely solved. Reusable by any self-hosted Flagsmith user through npm and a GitHub Action. |
| **Creativity** | Not in the 18 published ideas, not in the ecosystem, not in general flag tooling. The insight — independently audit the sponsor's own Bayesian engine and surface SRM/quarantine — requires reading upstream source, which is exactly the work you did. |
| **Demo video** | Inherently dramatic: a dashboard shows a confident 94% win; the tool says INVALID and explains why; you fix the cause; the tool says TRUSTWORTHY. Problem, mechanism and Flagsmith role are visible in under two minutes. |

Track 03 asks specifically for self-hosted Flagsmith, integrations/plugins, developer
tooling and ease of reuse. ToggleTruth hits all four. The rules page also says a project
can be entered in more than one track — if the CLI reads well as an agent tool, consider
entering Track 02 as well with a human-approval gate on any change.

### 1.5 The 48-hour deliverable

A public repo containing: the TypeScript CLI, a pure statistics engine ported from
upstream, a deterministic in-process fake server and tests, a GitHub Action, a
one-command self-host `docker-compose.yml`, a sample broken experiment to demonstrate
against, and a README someone else can follow. Nothing in the repo contains a key.

### 1.6 Non-goals

Not a replacement dashboard. Not a general flag linter. No creating, starting or
editing experiments (read-only by design). No warehouse credentials in the tool —
it consumes the results payload Flagsmith already exposes. No claim of statistical
superiority to upstream: the tool **recomputes and cross-checks**, it does not replace.

---

## Part 2 — The repro (technical specification)

### 2.1 Verified upstream contract

All of these were read from the cloned repo at commit `f4de7145` (v2.295.2):

| Need | Endpoint | Source |
|---|---|---|
| Projects | `GET /api/v1/projects/` | `openapi.yaml:14663` |
| Environments | `GET /api/v1/environments/?project=<id>` | `openapi.yaml:1763` |
| Experiments | `GET /api/v1/environments/{key}/experiments/` | `openapi.yaml:3308` |
| Experiment results | `GET /api/v1/environments/{key}/experiments/{id}/results/` | `openapi.yaml:3872` |
| Exposures | `GET /api/v1/environments/{key}/experiments/{id}/exposures/` | `openapi.yaml:3764` |
| Feature states | `GET /api/v1/environments/{key}/featurestates/` | `api/environments/urls.py:64-68` |
| Feature names | `GET /api/v1/projects/{id}/features/` | `api/projects/urls.py` router |

Auth is `Authorization: Token <master key>` for management endpoints (the OpenAPI
security schemes list `tokenAuth` and `Master API Key`). The results endpoint returns
`{as_of, last_error_at, refresh_requested_at, payload, is_final}` — the `payload` is
the opaque stats blob the tool recomputes from.

**Needs live verification:** the internal shape of `payload` and `exposures.payload`.
The upstream serializers in `api/experimentation/serializers.py:524-549` declare them
as generic JSON fields, so the spec cannot tell us the keys. Mitigation below.

### 2.2 The statistics engine — ported exactly

From `api/experimentation/stats.py` (130 lines, all read):

```
VariantStats(n, sum, sum_squares)
  mean     = sum / n
  variance = max(0, (sum_squares - sum²/n) / (n - 1))

compare_to_control(control, treatment):
  if control.n < 2 or treatment.n < 2 or control.mean <= 0: undefined
  lift = (treatment.mean - control.mean) / control.mean
  variance = treatment.variance / (treatment.n * control.mean²)
           + treatment.mean² * control.variance / (control.n * control.mean⁴)
  se = sqrt(variance)
  if se == 0: certainty = 0.5 if lift == 0 else (lift > 0)
  ci   = [lift - 1.959963984540054 * se, lift + 1.959963984540054 * se]
  win  = Φ(lift / se)

srm_p_value(observed, expected_shares):
  χ² = Σ (count - total*share)² / (total*share)
  p  = chi2_survival(χ², df = len(observed) - 1)
```

JavaScript has no `NormalDist`, so use the Abramowitz–Stegun 7.1.26 error-function
approximation (max error ~1.5e-7) for Φ, and port the upstream chi-squared recurrence
(`api/experimentation/stats.py:111-130`) verbatim. Unit-test the port against the
upstream docstring examples and known values (Φ(0)=0.5, Φ(1.96)≈0.975, χ²=0 → p=1).

### 2.3 Verdict rules

Evaluation order matters — a broken split makes a win probability meaningless, so SRM
and quarantine are checked before the inference.

| Check | Condition | Verdict |
|---|---|---|
| No results | `payload == null` / not `is_final` | INCONCLUSIVE — not computed |
| Sample ratio mismatch | `srm_p_value < 0.001` | **INVALID** — traffic split broken |
| Quarantined identities | `quarantined_count > 0` | **INVALID** — users saw more than one variant |
| Too little data | any arm `n < 2`, control mean ≤ 0 | INCONCLUSIVE |
| Interval spans zero | `ci_low <= 0 <= ci_high` | INCONCLUSIVE — say what traffic would close it |
| Clean win | above all pass and `chance_to_win >= 0.95` | TRUSTWORTHY |
| Otherwise | — | INCONCLUSIVE |

Exit codes make this a real gate: `0` trustworthy, `2` inconclusive, `1` invalid.

### 2.4 Preflight simulator — the second differentiator

`toggled preflight --baseline 0.05 --mde 0.10 --traffic 400/day` uses the same delta
method in reverse to estimate the exposures needed for the 95% interval to clear zero,
then answers the question every team asks too late: **will this experiment resolve by
Sunday?** It is the upstream advice ("decide roughly how much traffic you need before
you start") turned into a command. Keep the model simple and state its assumptions in
the output — an honest approximation beats a fake exact answer.

### 2.5 Architecture

```
src/
  stats.ts        pure port of upstream stats.py — no I/O, fully unit-testable
  verdict.ts      ordered rules → verdict + reasons + remediation
  preflight.ts    reverse sample-size estimate
  client.ts       thin Flagsmith management API client, Token auth, timeouts
  mock.ts         deterministic in-process fake of the five endpoints
  report.ts       pure text/JSON renderer, cell-width aware, NO_COLOR aware
  index.ts        CLI: check | preflight | doctor | --demo | --json
  *.test.ts       colocated tests
```

Zero runtime dependencies. Node 20+ built-ins only (`fetch`, `node:test`, `node:assert`).
Every number in the report must come from `stats.ts` or the API payload — no invented
metrics.

### 2.6 The payload-shape problem — mitigation

The one real unknown is the shape of `results.payload`. Do **not** guess it in the
tool. Instead:

1. Build `client.ts` so the payload is passed through as opaque JSON.
2. Write `adaptPayload(payload)` with a small set of recognised shapes and a
   *fail loud* path that prints the payload keys and exits 1 with "unsupported payload
   shape — please open an issue with these keys".
3. In `--demo`, use a deterministic fixture in the canonical shape. The demo never
   depends on a live instance, so the video is reliable even if WiFi or Docker fails.
4. Run one live smoke test against your self-hosted instance before the video. If the
   shape differs, adding one adapter branch is a 20-minute job.

This keeps the moat (upstream math) while removing the only blocking unknown.

### 2.7 Demo video script — 2 minutes 30 seconds

| Time | Shot |
|---|---|
| 0:00–0:15 | The problem: Flagsmith dashboard shows a variation at 94% win probability. Voice: "This looks like a win. It isn't." |
| 0:15–0:40 | `toggled check --api-url ... --experiment 7` against self-hosted instance. Tool prints INVALID with SRM p=0.0004, 312 quarantined identities, interval crossing zero. |
| 0:40–1:05 | Explain the mechanism: upstream's own chi-squared SRM test, recomputed; identifiers re-generated per request so users saw both variants. Show the one-line code fix. |
| 1:05–1:30 | Re-run. Verdict flips to TRUSTWORTHY: SRM p=0.62, no quarantine, CI clears zero, chance-to-win 91%. Same experiment, verified result. |
| 1:30–1:55 | `toggled preflight` before the next experiment: "At 400 exposures/day this will not resolve by Sunday. You need 1,200/day." |
| 1:55–2:15 | The reuse story: `npm i -g toggletruth`, GitHub Action snippet, exit code 1 failing a deliberately bad CI run. |
| 2:15–2:30 | Flagsmith role: show the self-hosted instance and the API calls the tool made. Close on the repo and README. |

Record this Saturday, not Sunday.

---

## Part 3 — The 48-hour plan

### Day 1 — Friday 27 Nov, 20:00 → 02:00 IST (6h)

- [ ] 20:00–20:30 — Star Flagsmith (AirPods draw), register, create the public repo
      `toggletruth`, push `ANALYSIS.md`, `WIN-PLAN.md`, `README.md` skeleton. Nothing secret.
- [ ] 20:30–21:30 — Start Flagsmith with the upstream `docker-compose.yml`. Confirm
      dashboard on `localhost:8000`, create a project, a multivariate flag with **keyed
      variations** and a metric. Do this before writing tool code.
- [ ] 21:30–22:00 — Capture the real `experiments/{id}/results/` and `exposures/`
      payloads with curl into a local fixture file. This closes the only unknown early.
- [ ] 22:00–23:30 — Implement `stats.ts` + tests. Red-green: write expected values from
      upstream formulas first, then implement until green.
- [ ] 23:30–00:30 — Implement `client.ts` and `adaptPayload()` against the captured fixture.
- [ ] 00:30–01:30 — `verdict.ts` with the ordered rules and remediation text.
- [ ] 01:30–02:00 — Commit. Sleep. A tired Sunday is more expensive than a short night.

### Day 2 — Saturday 28 Nov, 09:00 → 02:00 IST (17h)

- [ ] 09:00–10:00 — `preflight.ts` + tests.
- [ ] 10:00–11:30 — `report.ts`: text and JSON modes, NO_COLOR, non-TTY, exit codes.
- [ ] 11:30–13:00 — `mock.ts` and end-to-end tests of the full `check` flow, including
      the deliberately broken scenario and the fixed one.
- [ ] 13:00–14:00 — Lunch away from the screen.
- [ ] 14:00–15:30 — GitHub Action (`action.yml`) + a workflow that runs `toggled check`
      on a fixture and fails on INVALID. This is the "reusable" scoring line.
- [ ] 15:30–17:00 — README with setup, env vars, real run commands, expected output,
      and an explicit "how Flagsmith is core" section. Add `AGENTS.md` and `LICENSE`.
- [ ] 17:00–18:00 — Run the live smoke test against your self-hosted instance. Add an
      adapter branch if needed. Record the real terminal output.
- [ ] 18:00–19:00 — Prepare the broken and fixed experiment states in the dashboard.
- [ ] 19:00–20:00 — **Record and cut the demo video.** Script above. Do not leave this
      for Sunday.
- [ ] 20:00–22:00 — `npm run check` (typecheck, tests, build). Paste the 80x24 and
      120x40 renders. Review the diff against `code-review-checklist` axes.
- [ ] 22:00–00:00 — Buffer: fix whatever the review found. Commit.
- [ ] 00:00–02:00 — Optional: polish the report output and the preflight explanation.

### Day 3 — Sunday 29 Nov, 09:00 → 18:00 IST

- [ ] 09:00–11:00 — Full verification from a clean clone. Follow the README literally.
      If anything fails, the README was wrong — fix the README.
- [ ] 11:00–13:00 — Read the experiment result properly. If the interval crosses zero,
      say so in the README and video rather than dressing it up.
- [ ] 13:00–15:00 — Final review: keys out of the repo, no invented numbers in the
      report, README honest about what is verified and what needs a live instance.
- [ ] 15:00–16:00 — Submit repo + README + video.
- [ ] 16:00–18:00 — Buffer. Answer judge questions with the source citations in
      `ANALYSIS.md` and this document.

### Verification checklist — nothing claimed until run

- [ ] `npm run typecheck` exits 0.
- [ ] `npm test` exits 0 with a visible pass count.
- [ ] `npm run build` exits 0.
- [ ] Pasted 80x24 and 120x40 renders of `toggled --demo check`.
- [ ] `--json` output parses and exit codes are 0/1/2 as specified.
- [ ] Fresh clone + README setup works.
- [ ] Live self-hosted smoke test passes — mark `not_verified_here` if Docker stays
      unavailable, and never claim it worked.

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| Unknown results payload shape | Capture it from a live instance on Day 1; adapter + fail-loud path; demo uses a fixed fixture. |
| No Docker on this machine | Compose file and live connection are marked unverified here; you run them. The tool itself is fully testable in-process. |
| Math port subtly wrong | Tests against upstream formulas and known CDF/χ² values; keep stats pure and I/O-free. |
| Two-day scope creep | Read-only, five endpoints, one verdict, one simulator. No dashboard, no agents, no warehouse access. |
| Someone builds the same thing | The moat is the upstream-faithful statistics + SRM/quarantine checks, not the CLI shell. That takes reading source, not a weekend of scaffolding. |

### Sources used for this research

- `https://www.wemakedevs.org/hackathons/flagsmith` and `/rules`
- `https://www.wemakedevs.org/blogs/toggle-wars-project-ideas-and-getting-started/llms.txt`
- `https://www.wemakedevs.org/blogs/how-to-win-toggle-wars/llms.txt`
- `https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent`
- Cloned `Flagsmith/flagsmith` at `f4de7145`: `openapi.yaml`, `api/experimentation/stats.py`,
  `api/experimentation/results_query.py`, `api/experimentation/serializers.py`,
  `api/features/`, `api/environments/urls.py`, `api/projects/urls.py`, CI configs, Makefiles.
- Live GitHub org listing for `Flagsmith/*` repositories.
