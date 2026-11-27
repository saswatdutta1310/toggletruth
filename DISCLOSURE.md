# Disclosure

## What this is

ToggleTruth is an independent, read-only auditor for Flagsmith experiments. It is not
affiliated with, endorsed by, or maintained by Flagsmith or WeMakeDevs. It reimplements
formulas from Flagsmith's open-source code under MIT; Flagsmith core is BSD-3-Clause.

## AI assistance

This repository was built with the assistance of Hermes Agent, an AI coding assistant.
The human maintainer reviewed the design, the ported formulas, the test evidence and
the final diff before publishing. Per the hackathon rules, the maintainer can explain
every line of submitted code. AI-generated output is not a substitute for that
understanding.

## Data handling

- Read-only: the tool issues `GET` requests only. It never creates, edits, starts or
  stops an experiment, and never changes a feature flag.
- The master API token is taken from a CLI argument or environment variable, placed in
  an outbound header, and never logged, printed, persisted or sent to any host other
  than the `--api-url` you supply.
- No telemetry, analytics, crash reporting or network calls beyond the supplied
  Flagsmith API URL.
- No credentials or sample tokens are committed. `--demo` is fully in-process.

## Statistical scope

- The verdict is an engineering gate, not a statement about product value.
- The normal approximation used for the interval and the Abramowitz–Stegun error
  function carry documented error; they are not an exact port of Python's `NormalDist`.
- Sample-ratio-mismatch and quarantine checks can invalidate a result, but they cannot
  prove that the remaining data is free of *every* bias. Identifier stability must
  still be checked in the application code.
- Preflight is an estimate under a normal model. It does not replace a live run.

## Verification boundary

Verified in the build environment: typecheck, build, 18 unit tests, deterministic demo
output and exit codes. **Not verified here:** a live self-hosted Flagsmith instance and
the exact internal shape of its results payload — Docker was unavailable in the build
environment. The adapter fails loudly rather than inventing numbers when it sees an
unknown payload shape. See `docs/ISSUE-ANALYSIS.md` for the evidence and open items.
