# Issue analysis: the win that was not a win

This document records the repro → isolation → root cause → fix cycle behind ToggleTruth.

## 1. Repro

A Flagsmith experiment on flag `invite_cta` shows a treatment with a high win
probability. The organiser's own guide warns that this can happen while the result is
worthless. Deterministic reproduction:

```bash
node dist/index.js check --demo --scenario broken
```

Observed output (exit code 1):

```
VERDICT: INVALID
  sample ratio mismatch p : <1e-6
  quarantined identities   : 312
  - Sample ratio mismatch: the traffic split does not match the configured weights.
  - 312 identities were exposed to more than one variant and were quarantined.
```

The fixture deliberately has 800 control exposures against 200 treatment exposures
under a configured 50/50 split, and 312 identities recorded against more than one
variant.

## 2. Isolation

Three candidate causes were separated:

1. **The statistics engine was absent.** RED run: 7/7 tests failed with
   `Error: not implemented`. This was the implementation gap, not the domain bug.
2. **A precision assertion was too strict.** After implementing the engine, 6/7 tests
   passed. Measured delta on chance-to-win was `6.8769e-8`; the A&S 7.1.26 approximation
   documents a maximum error of ~1.5e-7. The code was correct; the test contract was
   over-specified at 1e-9. Corrected to 1e-6 with the reason recorded in the test.
3. **The "healthy" fixture was not healthy.** 5% vs 6.5% at n=1000 per arm yields a
   89.7% chance to win, below the 95% gate. Recomputed the fixture from upstream's
   formula to 5% vs 7% at n=2000 per arm: lift 40%, interval 5.1%–74.9%, win 98.8%.

None of these were fixed by loosening the product rules. Only #2 and #3 were test-data
corrections with the calculation shown; #1 was the real implementation work.

## 3. Root cause of the domain issue

A high win probability is computed from arm totals. It says nothing about whether the
arms were assigned correctly or whether an identity saw a consistent experience.
Upstream already knows this:

- `stats.py::srm_p_value` compares observed exposures to configured shares with a
  chi-squared test; p < 0.001 conventionally means the split is broken.
- `results_query.py::exposures_cte` marks an identity `quarantined` when it has more
  than one distinct variant value.

The failure is that these signals sit inside the platform and are not surfaced as a
decision the team can gate on. A dashboard's headline number can therefore look healthy
while the experiment is invalid.

## 4. Fix, without over-engineering

A read-only CLI that:

1. fetches the results payload from a self-hosted instance;
2. adapts it to a small internal shape, failing loudly on unknown shapes;
3. checks SRM and quarantine **before** computing any inference;
4. ports the upstream lift/interval/win formula exactly;
5. returns a verdict plus exit codes 0/1/2 for CI.

No database access, no warehouse credentials, no dashboard, no agent, no new runtime
dependency. Two read-only API calls, one verdict, one preflight estimate.

## 5. Evidence

- RED: 7 failing tests, all `not implemented`.
- GREEN after the port: 18/18 passing, `npm run check` exit 0.
- Broken scenario: exit 1, INVALID, both root causes named.
- Fixed scenario: exit 0, TRUSTWORTHY, 98.8% chance to win.

## 6. Additional defect found in the final review

**Repro:** `toggletruth check --demo --scenario fixed --expected-shares 0.5` returned
`TRUSTWORTHY` with `p = 1.0000`.

**Isolation:** two defects combined. `--expected-shares` was only applied in the live
API branch, so demo mode ignored it entirely; and `srmPValue` indexed past a one-item
share list, producing NaN, which satisfies neither `< 0.001` nor any error check.

**Root cause:** missing input validation in a statistical check — upstream uses
`zip(strict=True)` and would have raised.

**Fix:** `srmPValue` now requires one finite positive share per variant and throws on
a ragged list; the CLI applies `--expected-shares` in both branches and clones demo
fixtures to avoid shared mutation. Two RED-first tests cover the direct function and
the CLI path. 20/20 tests pass; the malformed command now exits 1 with
`expected shares must have one value per variant (2), got 1`.

## 7. Open items

- Live payload shape must be captured from a self-hosted instance; Docker was not
  available in the build environment. `adaptPayload` prints the observed keys rather
  than guessing if the shape differs.
