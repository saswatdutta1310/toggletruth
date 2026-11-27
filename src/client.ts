import type { AuditInput, VariantStat } from "./verdict.js";

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Thin read-only client for the Flagsmith management API.
 * The token is only ever placed in an outbound header; it is never logged.
 */
export class FlagsmithClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchFn: FetchLike = fetch as unknown as FetchLike,
  ) {
    if (!token) throw new Error("A Flagsmith master API token is required.");
  }

  private async get(path: string): Promise<unknown> {
    const url = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    const response = await this.fetchFn(url, {
      headers: { Authorization: `Token ${this.token}` },
    });
    if (!response.ok) {
      throw new Error(`Flagsmith API ${response.status} for ${path}`);
    }
    return JSON.parse(await response.text()) as unknown;
  }

  results(environmentKey: string, experimentId: string | number) {
    return this.get(
      `/api/v1/environments/${encodeURIComponent(environmentKey)}/experiments/${experimentId}/results/`,
    );
  }

  exposures(environmentKey: string, experimentId: string | number) {
    return this.get(
      `/api/v1/environments/${encodeURIComponent(environmentKey)}/experiments/${experimentId}/exposures/`,
    );
  }
}

/**
 * Upstream `views.py` wraps results as `{"results": {..., "payload": ...}}`.
 * Accept that shape, the older `{payload: ...}` shape, and an already-unwrapped
 * payload, so the demo fixture and a live instance follow the same path.
 */
export function unwrapResults(response: unknown): unknown {
  const root = asRecord(response);
  if (!root) return response;
  const wrapper = asRecord(root.results);
  if (wrapper && "payload" in wrapper) return wrapper.payload;
  if ("payload" in root) return root.payload;
  if (root.results !== undefined) return root.results;
  return response;
}

export interface ResultsMetadata {
  asOf?: string;
  lastErrorAt?: string;
  isFinal?: boolean;
}

export function resultsMetadata(response: unknown): ResultsMetadata {
  const root = asRecord(response);
  if (!root) return {};
  const wrapper = asRecord(root.results) ?? root;
  const text = (key: string): string | undefined => {
    const value = wrapper[key];
    return typeof value === "string" && value ? value : undefined;
  };
  return {
    asOf: text("as_of"),
    lastErrorAt: text("last_error_at"),
    isFinal: typeof wrapper.is_final === "boolean" ? wrapper.is_final : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function toVariant(value: unknown): VariantStat | null {
  const record = asRecord(value);
  if (!record) return null;
  const n = Number(record.n ?? record.count ?? record.exposures);
  const conversions = Number(
    record.conversions ?? record.successes ?? record.sum ?? 0,
  );
  const sum = Number(record.sum ?? conversions);
  const sumSquares = Number(record.sumSquares ?? record.sum_squares ?? sum);
  const name = String(record.name ?? record.variant ?? "unknown");
  if (!Number.isFinite(n) || n <= 0) return null;
  return { name, n, sum, sumSquares };
}

/**
 * Adapt an opaque Flagsmith results payload into the audit shape.
 * Unknown shapes fail loudly with their keys rather than guessing numbers.
 */
export function adaptPayload(
  payload: unknown,
  featureName = "experiment",
): AuditInput {
  const root = asRecord(payload);
  if (!root) throw new Error("Flagsmith results payload is not an object.");

  const rawVariants =
    root.variants ?? root.results ?? root.data ?? root.experiments;
  if (!Array.isArray(rawVariants)) {
    throw new Error(
      `Unsupported Flagsmith results payload. Top-level keys: ${Object.keys(root).join(", ")}. Please open an issue with these keys.`,
    );
  }

  const variants = rawVariants
    .map(toVariant)
    .filter((variant): variant is VariantStat => variant !== null);
  if (variants.length < 2) {
    throw new Error(
      "Unsupported Flagsmith results payload: fewer than two readable variants.",
    );
  }

  const expectedShares = Array.isArray(root.expectedShares)
    ? (root.expectedShares as unknown[]).map(Number)
    : undefined;

  return {
    featureName: String(root.featureName ?? featureName),
    variants,
    quarantined: Number(root.quarantined ?? root.quarantined_count ?? 0),
    expectedShares,
    asOf: root.as_of ? String(root.as_of) : undefined,
  };
}
