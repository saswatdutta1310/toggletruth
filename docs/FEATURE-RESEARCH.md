# Feature research — what to add next

Retrieved 2026-11-27 22:17 IST. Question: which additions give the most Toggle Wars
Track 03 score per hour, given the tool already works?

Source boundary: primary source is the cloned Flagsmith repo at commit `f4de7145`
(v2.295.2), read directly; judge guidance is the WeMakeDevs "How to Win Toggle Wars"
post retrieved earlier this session. No live Flagsmith instance was available, so
payload shapes derived from serializers are marked *needs live confirmation*.

## Current state

`main` is pushed at `6460d74`, self-PR closed, 20/20 tests green, zero runtime deps.
The tool fetches only `results`, uses `results.payload`, and picks the highest-mean
treatment. It does not use `exposures`, project/environment endpoints, status, or
freshness fields.

## P0 — Fix the live response envelope (bug, not a feature)

Upstream `api/experimentation/views.py:594-601` returns:

```python
Response({"results": ExperimentResultsSerializer(results).data if results else None})
```

and the exposures action returns `{"exposures": ...}`. The serializer
(`api/experimentation/serializers.py:538-549`) yields `{as_of, last_error_at,
refresh_requested_at, payload, is_final}`.

Our `client.ts` passes `{results: {...}}` to `adaptPayload`, which looks for
`variants/results/data/experiments` as an **array**. `root.results` is an object, so
the live path throws "Unsupported Flagsmith results payload" instead of auditing. The
deterministic demo passed because its fixture is already the inner shape.

Fix: unwrap `response.results.payload` in `runCheck`, and add a test with the real
envelope. Roughly 20 lines. **This blocks a live demo, so it comes first.**

## P1 — Auto-read the configured traffic split

`api/experimentation/serializers.py:455-486` (`ExperimentFeatureSerializer`) adds
`default_percentage_allocation` to each multivariate option by reading the environment
feature state. The experiment detail endpoint therefore exposes the configured weights
without any manual flag.

Today the user must pass `--expected-shares 0.5,0.5`, and a ragged list is a newly
fixed failure mode. Reading the weights from Flagsmith itself removes that argument,
makes the SRM check meaningful without user input, and makes Flagsmith more clearly
the mechanism. **Effort: 1–2 h.** Needs live confirmation of the response shape.

## P2 — Freshness gate using fields already fetched

`api/experimentation/models.py:232-267` (`ExperimentComputation`) defines `as_of`,
`last_error_at`, `refresh_requested_at` and `is_final`, with an explicit comment that a
failed refresh preserves the last good payload and relies on a staleness note.
`EXPOSURES_REFRESH_MIN_INTERVAL` and `RESULTS_REFRESH_MIN_INTERVAL` are 5 minutes
(`api/experimentation/constants.py:11-12`).

Add a verdict rule: `last_error_at` present, `as_of` older than a configurable age,
or `is_final === false` on a completed experiment → INCONCLUSIVE with the age in the
reason. No new endpoint, no new dependency. **Effort: ~1 h.** This is the cheapest
credibility gain in the list: it stops a judge seeing a week-old number presented as
current.

## P3 — `exposures` audit command

The client already has `exposures()` but nothing calls it. Upstream
`api/experimentation/results_query.py:29-51` deduplicates events and quarantines any
identity with more than one distinct variant value. The organisers' judging guide
calls an unstable identifier the first silent invalidator.

A `toggled exposures` command reporting per-variant exposure counts, quarantine count
and first-exposure time directly surfaces that check. **Effort: 2–3 h.** Strong
differentiator and reuses code already present.

## P4 — Compare every treatment, not only the best

`compareToControl` already supports any pair. Reporting one row per treatment with a
note that multiple comparisons widen the interval is more honest than silently
choosing the highest mean. **Effort: ~2 h.** Moderate score gain.

## P5 — Token from the environment

`--token <value>` puts a master API key on the process command line. Supporting
`FLAGSMITH_TOKEN` (and `FLAGSMITH_API_URL`) with the CLI flag optional is a small
security and reuse improvement, and the rules explicitly warn about committed keys.
**Effort: ~30 min.**

## P6 — `doctor` command for the self-hosted instance

Use `GET /api/v1/projects/` and `GET /api/v1/environments/?project=<id>` (both in
`openapi.yaml`) to verify connectivity, list environments and show running experiments
(filter `status=RUNNING`, documented at `openapi.yaml:3308-3338`). This makes the
self-hosted requirement visible in the demo and helps another person reuse the tool.
**Effort: 2–3 h.**

## Ranking for today

1. **P0** — correctness blocker; do it before any live video.
2. **P2** — ~1 h, large credibility gain, uses data already fetched.
3. **P5** — ~30 min, security/reuse.
4. **P1** — 1–2 h, removes a manual step if a live instance is available to confirm.
5. **P3** — 2–3 h, the next real feature if time remains.

P4 and P6 are lower-value polish for this track and can wait.

## Retrieval gaps

- Exact `payload` JSON shape for results and exposures: upstream declares generic JSON,
  so only a live self-hosted instance can settle it. The adapter fails loudly rather
  than guessing.
- Whether `ExperimentDetailSerializer` embeds `multivariate_options` in list responses
  or only in detail responses; P1 depends on this.
- No live CI result for the pushed `main` was observed in this research round; earlier
  CI checks on PR #1 passed.

## Sources

- Cloned `Flagsmith/flagsmith` @ `f4de7145`: `api/experimentation/views.py`,
  `api/experimentation/serializers.py`, `api/experimentation/models.py`,
  `api/experimentation/constants.py`, `api/experimentation/results_query.py`,
  `openapi.yaml`.
- `https://www.wemakedevs.org/blogs/how-to-win-toggle-wars/llms.txt` (retrieved earlier
  this session): scorecard and four silent invalidators.
- `https://www.wemakedevs.org/hackathons/flagsmith/rules` (retrieved earlier this
  session): public repo, README, demo video requirements.
