import { FlagsmithClient, adaptPayload } from "./client.js";
import { brokenExperiment, fixedExperiment } from "./demo.js";
import { preflight, type PreflightInput } from "./preflight.js";
import { renderJson, renderPreflight, renderText } from "./report.js";
import { audit, type AuditInput } from "./verdict.js";

export interface CliResult {
  exitCode: number;
  stdout: string;
}

interface Flags {
  [key: string]: string | boolean;
}

function parseFlags(tokens: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key.includes("=")) {
      const [name, value] = key.split("=", 2);
      flags[name] = value;
    } else if (
      tokens[index + 1] !== undefined &&
      !tokens[index + 1].startsWith("--")
    ) {
      flags[key] = tokens[index + 1];
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function stringValue(flags: Flags, key: string): string {
  const value = flags[key];
  return typeof value === "string" ? value : "";
}

function numberValue(flags: Flags, key: string, fallback: number): number {
  const raw = stringValue(flags, key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const HELP = [
  "toggletruth - experiment integrity for self-hosted Flagsmith",
  "",
  "Commands:",
  "  check     audit an experiment",
  "  preflight estimate traffic needed before an experiment",
  "",
  "check options:",
  "  --api-url URL        self-hosted Flagsmith API base URL",
  "  --token TOKEN        master API token (never logged or stored)",
  "  --environment KEY    environment API key",
  "  --experiment ID      experiment id",
  "  --expected-shares A,B  optional weights, e.g. 0.5,0.5",
  "  --demo               use deterministic fixtures (no network)",
  "  --scenario broken|fixed  demo scenario, default broken",
  "  --json               machine-readable output",
  "",
  "Exit codes: 0 trustworthy, 1 invalid, 2 inconclusive",
].join("\n");

async function runCheck(flags: Flags): Promise<CliResult> {
  let input: AuditInput;

  if (flags.demo) {
    input = {
      ...(flags.scenario === "fixed" ? fixedExperiment : brokenExperiment),
    };
  } else {
    const apiUrl = stringValue(flags, "api-url");
    const token = stringValue(flags, "token");
    const environment = stringValue(flags, "environment");
    const experiment = stringValue(flags, "experiment");
    if (!apiUrl || !token || !environment || !experiment) {
      return {
        exitCode: 2,
        stdout:
          "check requires --api-url, --token, --environment and --experiment (or use --demo)",
      };
    }
    const client = new FlagsmithClient(apiUrl, token);
    const response = (await client.results(environment, experiment)) as {
      payload?: unknown;
    };
    input = adaptPayload(response.payload ?? response);
  }

  const shares = stringValue(flags, "expected-shares");
  if (shares) {
    input.expectedShares = shares.split(",").map(Number);
  }

  const result = audit(input);
  return {
    exitCode: result.exitCode,
    stdout: flags.json ? renderJson(result) : renderText(result),
  };
}

function runPreflight(flags: Flags): CliResult {
  const input: PreflightInput = {
    baseline: numberValue(flags, "baseline", 0.05),
    mde: numberValue(flags, "mde", 0.1),
    trafficPerDay: numberValue(flags, "traffic", 400),
    daysUntil: numberValue(flags, "days-until", 2),
  };
  try {
    return {
      exitCode: 0,
      stdout: renderPreflight(input, preflight(input)),
    };
  } catch (error) {
    return {
      exitCode: 2,
      stdout: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function run(argv: string[]): Promise<CliResult> {
  const command = argv[0] ?? "help";
  const flags = parseFlags(argv.slice(1));
  try {
    if (command === "check") return await runCheck(flags);
    if (command === "preflight") return runPreflight(flags);
    return { exitCode: 0, stdout: HELP };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: error instanceof Error ? error.message : String(error),
    };
  }
}
