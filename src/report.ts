import { formatP, type AuditResult } from "./verdict.js";
import type { ExposureReport } from "./client.js";
import type { PreflightInput, PreflightResult } from "./preflight.js";

export function renderText(result: AuditResult): string {
  const lines: string[] = [];
  lines.push(`VERDICT: ${result.verdict}`);
  lines.push(`flag: ${result.featureName}${result.asOf ? `  as of ${result.asOf}` : ""}`);
  lines.push("");
  lines.push(`  sample ratio mismatch p : ${result.srm === null ? "n/a" : formatP(result.srm)}`);
  lines.push(`  quarantined identities   : ${result.quarantined}`);
  if (result.inference) {
    lines.push(
      `  lift (${result.control} -> ${result.treatment}) : ${(result.inference.lift * 100).toFixed(1)}%`,
    );
    lines.push(
      `  95% interval              : ${(result.inference.ciLow * 100).toFixed(1)}% to ${(result.inference.ciHigh * 100).toFixed(1)}%`,
    );
    lines.push(
      `  chance to win             : ${(result.inference.chanceToWin * 100).toFixed(1)}%`,
    );
  }
  lines.push("");
  for (const reason of result.reasons) {
    lines.push(`  - ${reason}`);
  }
  return lines.join("\n");
}

export function renderJson(result: AuditResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderExposures(report: ExposureReport): string {
  const lines = ["EXPOSURES"];
  if (report.asOf) lines.push(`  as of ${report.asOf}`);
  for (const [variant, count] of Object.entries(report.perVariant)) {
    lines.push(`  ${variant.padEnd(20)} ${count}`);
  }
  lines.push(`  excluded identities : ${report.excluded}`);
  lines.push(`  time buckets        : ${report.buckets}`);
  lines.push(
    "  Upstream quarantines identities exposed to more than one variant; a nonzero count makes the result INVALID.",
  );
  return lines.join("\n");
}

export function renderPreflight(
  input: PreflightInput,
  result: PreflightResult,
): string {
  return [
    `PREFLIGHT: ${result.feasible ? "ON TRACK" : "NOT ON TRACK"}`,
    `  baseline ${(input.baseline * 100).toFixed(1)}%  mde ${(input.mde * 100).toFixed(1)}%  traffic ${input.trafficPerDay}/day`,
    `  needs ~${result.perArm} exposures per arm (${result.total} total)`,
    `  about ${result.daysNeeded.toFixed(1)} days at this traffic`,
    result.feasible
      ? `  resolves within your ${input.daysUntil} days.`
      : `  will not resolve within ${input.daysUntil} days at this traffic.`,
    "  Approximation: normal interval on relative lift; verify against a live run.",
  ].join("\n");
}
