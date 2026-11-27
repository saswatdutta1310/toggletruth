/**
 * Bayesian statistics for experiment results.
 *
 * Ported from Flagsmith/flagsmith `api/experimentation/stats.py` at commit
 * f4de7145 (v2.295.2). The formulas are kept identical so an independent
 * audit agrees with the platform by construction. JavaScript has no
 * `statistics.NormalDist`, so `normalCdf` uses the Abramowitz & Stegun 7.1.26
 * error-function approximation (maximum error ~1.5e-7).
 */

export interface VariantStats {
  n: number;
  sum: number;
  sumSquares: number;
}

export interface Inference {
  lift: number;
  ciLow: number;
  ciHigh: number;
  chanceToWin: number;
}

const Z_95 = 1.959963984540054;
const SQRT_2 = Math.SQRT2;

export function mean(stats: VariantStats): number {
  return stats.sum / stats.n;
}

export function variance(stats: VariantStats): number {
  return Math.max(
    0,
    (stats.sumSquares - stats.sum ** 2 / stats.n) / (stats.n - 1),
  );
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const polynomial =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
    t;
  return sign * (1 - polynomial * Math.exp(-ax * ax));
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / SQRT_2));
}

export function compareToControl(
  control: VariantStats,
  treatment: VariantStats,
): Inference | null {
  if (control.n < 2 || treatment.n < 2 || mean(control) <= 0) return null;

  const controlMean = mean(control);
  const treatmentMean = mean(treatment);
  const lift = (treatmentMean - controlMean) / controlMean;
  const v =
    variance(treatment) / (treatment.n * controlMean ** 2) +
    (treatmentMean ** 2 * variance(control)) /
      (control.n * controlMean ** 4);
  const standardError = Math.sqrt(v);

  if (standardError === 0) {
    const certainty = lift === 0 ? 0.5 : Number(lift > 0);
    return {
      lift,
      ciLow: lift,
      ciHigh: lift,
      chanceToWin: certainty,
    };
  }

  return {
    lift,
    ciLow: lift - Z_95 * standardError,
    ciHigh: lift + Z_95 * standardError,
    chanceToWin: normalCdf(lift / standardError),
  };
}

export function chiSquaredSurvival(
  statistic: number,
  degreesOfFreedom: number,
): number {
  if (statistic <= 0) return 1;

  const y = statistic / 2;
  let a: number;
  let survival: number;
  if (degreesOfFreedom % 2) {
    a = 0.5;
    survival = erfc(Math.sqrt(y));
  } else {
    a = 1;
    survival = Math.exp(-y);
  }

  while (a + 1 <= degreesOfFreedom / 2) {
    survival += Math.exp(a * Math.log(y) - y - logGamma(a + 1));
    a += 1;
  }
  return survival;
}

// Complementary error function via the same A&S approximation.
function erfc(x: number): number {
  return 1 - erf(x);
}

// Lanczos log-gamma, used only by the integer/half-integer chi-squared recurrence.
function logGamma(z: number): number {
  const coefficients = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953,
  ];
  let x = z;
  let series = 1.000000000190015;
  for (const coefficient of coefficients) {
    x += 1;
    series += coefficient / x;
  }
  const t = z + 5.5;
  return (
    -t + (z + 0.5) * Math.log(t) + Math.log((2.5066282746310005 * series) / z)
  );
}

export function srmPValue(
  observed: number[],
  expectedShares: number[],
): number | null {
  const total = observed.reduce((sum, count) => sum + count, 0);
  if (
    observed.length < 2 ||
    total === 0 ||
    expectedShares.some((share) => share <= 0)
  ) {
    return null;
  }

  const statistic = observed.reduce((sum, count, index) => {
    const expected = total * expectedShares[index];
    return sum + (count - expected) ** 2 / expected;
  }, 0);

  return chiSquaredSurvival(statistic, observed.length - 1);
}
