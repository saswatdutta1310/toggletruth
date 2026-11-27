import { compareToControl, srmPValue, type Inference } from "./stats.js";

export interface VariantStat {
  name: string;
  n: number;
  sum: number;
  sumSquares: number;
}

export interface AuditInput {
  featureName: string;
  variants: VariantStat[];
  quarantined: number;
  expectedShares?: number[];
  asOf?: string;
  lastErrorAt?: string;
  maxAgeHours?: number;
}

export type Verdict = "TRUSTWORTHY" | "INCONCLUSIVE" | "INVALID";

export interface AuditResult {
  verdict: Verdict;
  exitCode: 0 | 1 | 2;
  reasons: string[];
  srm: number | null;
  quarantined: number;
  inference: Inference | null;
  control: string;
  treatment: string;
  featureName: string;
  asOf?: string;
}

const SRM_THRESHOLD = 0.001;

export function formatP(p: number): string {
  return p < 1e-6 ? "<1e-6" : p.toFixed(4);
}

/**
 * Ordered checks: a broken split or contaminated identities make the
 * inference meaningless, so they are evaluated first.
 */
export function audit(input: AuditInput): AuditResult {
  const reasons: string[] = [];
  const variants = input.variants;
  const shares =
    input.expectedShares ?? variants.map(() => 1 / Math.max(variants.length, 1));

  const observed = variants.map((variant) => variant.n);
  const srm = srmPValue(observed, shares);

  const base = {
    srm,
    quarantined: input.quarantined,
    inference: null,
    control: variants[0]?.name ?? "control",
    treatment: "none",
    featureName: input.featureName,
    asOf: input.asOf,
  };

  if (variants.length < 2) {
    return {
      ...base,
      verdict: "INCONCLUSIVE",
      exitCode: 2,
      reasons: ["Fewer than two variants were reported."],
    };
  }

  const freshness: string[] = [];
  if (input.lastErrorAt) {
    freshness.push(
      `The last results refresh failed at ${input.lastErrorAt}; this payload is a saved copy, not a current result.`,
    );
  }
  if (input.asOf) {
    const ageMs = Date.now() - Date.parse(input.asOf);
    const limitHours = input.maxAgeHours ?? 24;
    if (Number.isFinite(ageMs) && ageMs > limitHours * 3_600_000) {
      freshness.push(
        `Results are stale: ${(ageMs / 3_600_000).toFixed(1)}h old, limit ${limitHours}h.`,
      );
    }
  }
  if (freshness.length > 0) {
    return { ...base, verdict: "INCONCLUSIVE", exitCode: 2, reasons: freshness };
  }

  if (srm !== null && srm < SRM_THRESHOLD) {
    reasons.push(
      `Sample ratio mismatch: p=${formatP(srm)} (threshold ${SRM_THRESHOLD}). The traffic split does not match the configured weights.`,
    );
  }
  if (input.quarantined > 0) {
    reasons.push(
      `${input.quarantined} identities were exposed to more than one variant and were quarantined.`,
    );
  }
  if (reasons.length > 0) {
    return { ...base, verdict: "INVALID", exitCode: 1, reasons };
  }

  const control = variants[0];
  const treatment = variants.slice(1).reduce((best, candidate) =>
    candidate.sum / Math.max(candidate.n, 1) > best.sum / Math.max(best.n, 1)
      ? candidate
      : best,
  );
  const inference = compareToControl(control, treatment);

  if (!inference) {
    return {
      ...base,
      verdict: "INCONCLUSIVE",
      exitCode: 2,
      reasons: [
        "Not enough observations to compute a relative lift (need at least two identities per arm and a positive control mean).",
      ],
    };
  }

  const result = {
    ...base,
    inference,
    treatment: treatment.name,
  };

  if (inference.ciLow <= 0 && inference.ciHigh >= 0) {
    return {
      ...result,
      verdict: "INCONCLUSIVE",
      exitCode: 2,
      reasons: [
        `The 95% interval for lift spans zero (${(inference.ciLow * 100).toFixed(1)}% to ${(inference.ciHigh * 100).toFixed(1)}%). More traffic is needed before calling a winner.`,
      ],
    };
  }

  if (inference.chanceToWin >= 0.95) {
    return {
      ...result,
      verdict: "TRUSTWORTHY",
      exitCode: 0,
      reasons: [
        `Split is healthy, no quarantined identities, and the interval clears zero with ${(inference.chanceToWin * 100).toFixed(1)}% chance to win.`,
      ],
    };
  }

  return {
    ...result,
    verdict: "INCONCLUSIVE",
    exitCode: 2,
    reasons: [
      `Chance to win is ${(inference.chanceToWin * 100).toFixed(1)}%, below the 95% threshold used by this gate.`,
    ],
  };
}
