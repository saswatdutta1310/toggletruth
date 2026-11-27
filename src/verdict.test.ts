import test from "node:test";
import assert from "node:assert/strict";
import { audit } from "./verdict.js";
import { brokenExperiment, fixedExperiment } from "./demo.js";
import type { AuditInput } from "./verdict.js";

test("a broken split is INVALID even when win probability looks high", () => {
  const result = audit(brokenExperiment);
  assert.equal(result.verdict, "INVALID");
  assert.equal(result.exitCode, 1);
  assert.ok(result.reasons.some((reason) => reason.includes("Sample ratio mismatch")));
  assert.ok(result.reasons.some((reason) => reason.includes("312 identities")));
});

test("a healthy experiment with a clear interval is TRUSTWORTHY", () => {
  const result = audit(fixedExperiment);
  assert.equal(result.verdict, "TRUSTWORTHY");
  assert.equal(result.exitCode, 0);
  assert.ok(result.inference);
  assert.ok(result.inference.chanceToWin >= 0.95);
});

test("an interval spanning zero is INCONCLUSIVE", () => {
  const input: AuditInput = {
    featureName: "flat",
    quarantined: 0,
    variants: [
      { name: "control", n: 1000, sum: 50, sumSquares: 50 },
      { name: "treatment", n: 1000, sum: 52, sumSquares: 52 },
    ],
  };
  const result = audit(input);
  assert.equal(result.verdict, "INCONCLUSIVE");
  assert.equal(result.exitCode, 2);
  assert.ok(result.reasons.some((reason) => reason.includes("spans zero")));
});

test("quarantined identities alone invalidate an otherwise clean experiment", () => {
  const result = audit({ ...fixedExperiment, quarantined: 1 });
  assert.equal(result.verdict, "INVALID");
});
