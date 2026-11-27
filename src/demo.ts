import type { AuditInput } from "./verdict.js";

// Deterministic fixtures for the demo and tests. No live instance required.
// These mirror the shape Flagsmith's results payload is adapted into.

export const brokenExperiment: AuditInput = {
  featureName: "invite_cta",
  asOf: new Date(Date.now() - 5 * 60_000).toISOString(),
  expectedShares: [0.5, 0.5],
  quarantined: 312,
  variants: [
    { name: "control", n: 800, sum: 40, sumSquares: 40 },
    { name: "outcome_first", n: 200, sum: 16, sumSquares: 16 },
  ],
};

export const fixedExperiment: AuditInput = {
  featureName: "invite_cta",
  asOf: new Date(Date.now() - 5 * 60_000).toISOString(),
  expectedShares: [0.5, 0.5],
  quarantined: 0,
  variants: [
    { name: "control", n: 2000, sum: 100, sumSquares: 100 },
    { name: "outcome_first", n: 2000, sum: 140, sumSquares: 140 },
  ],
};
