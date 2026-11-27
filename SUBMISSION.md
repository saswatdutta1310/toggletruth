# Toggle Wars submission

Deadline: **29 November 2026, 20:00 IST**. Late submissions are not accepted.

Track: **03 — Build on Open Source Flagsmith** (PS5 + GTA 6 bundle).

Repository: `https://github.com/saswatdutta1310/toggletruth`

## Required by the rules

The rules page requires three things:

1. A public GitHub repository — done.
2. A README with setup steps and how you used Flagsmith — done (`README.md`).
3. A short demo video of the working project — **you need to record this**.

## One action only you can take

The delivery grant forbids the assistant from pushing to `main` or merging. The local
repository already has every file on `main`; the remote default branch still has only
GitHub's starter README. Push it from your terminal:

```bash
cd /home/dutta/toggletruth
git push origin main
```

Then close the now-unwanted self-PR (`gh pr close 1`), since no PR is needed for this
submission. I cannot perform either action under the active grant.

## Demo video script (~2 min 30 sec)

| Time | Shot |
|---|---|
| 0:00–0:15 | Show the Flagsmith dashboard with a variation at high win probability. Say: "This looks like a win. It isn't." |
| 0:15–0:40 | `node dist/index.js check --demo --scenario broken`. Show `VERDICT: INVALID`, SRM `<1e-6`, 312 quarantined identities, exit code 1. |
| 0:40–1:05 | Explain: the tool recomputes Flagsmith's own chi-squared split test and quarantine rule. Show the unstable-identifier line in app code. |
| 1:05–1:30 | Re-run with `--scenario fixed`. Show `VERDICT: TRUSTWORTHY`, interval 5.1%–74.9%, 98.8% chance to win, exit code 0. |
| 1:30–1:55 | `node dist/index.js preflight --baseline 0.05 --mde 0.1 --traffic 400 --days-until 2`. Show "NOT ON TRACK" and explain it answers "will this resolve by Sunday?" |
| 1:55–2:15 | Show `--json` output, the exit-code gate and `action.yml`. |
| 2:15–2:30 | Show the self-hosted Flagsmith instance and the two API endpoints the tool calls. Close on the repo and README. |

Record this before Sunday. The demo is fully in-process, so it cannot fail because of
network or Docker problems.

## Pre-submit checklist

- [ ] PR #1 merged; `main` contains the code and CI passes.
- [ ] Video recorded and uploaded/linked with the submission.
- [ ] README setup steps followed once from a clean clone.
- [ ] No token, key or credential in the repo (scan already passed).
- [ ] `DISCLOSURE.md` and `docs/ISSUE-ANALYSIS.md` left in place — they show the
      repro, isolation, root cause and fix, which is what the scorecard rewards.

## Honest boundary

A live self-hosted Flagsmith instance was not exercised in the build environment
(Docker unavailable). The results payload adapter fails loudly on unknown shapes
instead of guessing numbers. If you run the live check before submitting and the
payload shape differs, add one adapter branch, commit it to the `bot/` branch, open
a follow-up PR, and merge it — do not push to `main` directly.
