/** Reverse of the delta-method variance used by Flagsmith's stats.py. */
export interface PreflightInput {
  baseline: number;
  mde: number;
  trafficPerDay: number;
  daysUntil: number;
}

export interface PreflightResult {
  perArm: number;
  total: number;
  daysNeeded: number;
  feasible: boolean;
}

export function preflight(input: PreflightInput): PreflightResult {
  const { baseline, mde, trafficPerDay, daysUntil } = input;
  if (baseline <= 0 || baseline >= 1 || mde <= 0 || trafficPerDay <= 0) {
    throw new Error(
      "baseline must be between 0 and 1, mde and trafficPerDay must be positive",
    );
  }

  const treatment = baseline * (1 + mde);
  const varianceOfRelativeLift =
    (treatment * (1 - treatment)) / baseline ** 2 +
    (treatment ** 2 * (1 - baseline)) / baseline ** 3;

  // The interval clears zero when 1.9599 * se <= the minimum detectable effect.
  const standardErrorTarget = mde / 1.959963984540054;
  const perArm = Math.ceil(
    varianceOfRelativeLift / standardErrorTarget ** 2,
  );
  const total = perArm * 2;
  const daysNeeded = total / trafficPerDay;

  return {
    perArm,
    total,
    daysNeeded,
    feasible: daysNeeded <= daysUntil,
  };
}
