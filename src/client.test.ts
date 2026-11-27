import test from "node:test";
import assert from "node:assert/strict";
import { FlagsmithClient, adaptPayload, unwrapResults, resultsMetadata, configuredShares, unwrapExposures, adaptExposures, type FetchLike } from "./client.js";

test("client builds the management API URL and sends the token header", async () => {
  let seenUrl = "";
  let seenHeader = "";
  const fakeFetch: FetchLike = async (url, init) => {
    seenUrl = url;
    seenHeader = init?.headers?.Authorization ?? "";
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ payload: {} }),
    };
  };
  const client = new FlagsmithClient(
    "http://localhost:8000/",
    "test-token",
    fakeFetch,
  );
  await client.results("env-key", 7);
  assert.equal(
    seenUrl,
    "http://localhost:8000/api/v1/environments/env-key/experiments/7/results/",
  );
  assert.equal(seenHeader, "Token test-token");
});

test("client surfaces an HTTP error without echoing the token", async () => {
  const fakeFetch: FetchLike = async () => ({
    ok: false,
    status: 403,
    text: async () => "{}",
  });
  const client = new FlagsmithClient(
    "http://localhost:8000",
    "secret-value",
    fakeFetch,
  );
  await assert.rejects(
    () => client.exposures("env-key", 7),
    (error: Error) => !error.message.includes("secret-value"),
  );
});

test("unwrapResults reads the live Flagsmith results envelope", () => {
  const inner = {
    variants: [
      { name: "control", n: 10, conversions: 1 },
      { name: "treatment", n: 10, conversions: 2 },
    ],
  };
  assert.deepEqual(
    unwrapResults({ results: { as_of: "2026-11-27T18:00:00Z", payload: inner } }),
    inner,
  );
  assert.deepEqual(unwrapResults({ payload: inner }), inner);
  assert.deepEqual(unwrapResults(inner), inner);
});

test("resultsMetadata reads freshness fields from the live envelope", () => {
  const metadata = resultsMetadata({
    results: {
      as_of: "2026-11-27T18:00:00Z",
      last_error_at: null,
      is_final: false,
      payload: {},
    },
  });
  assert.equal(metadata.asOf, "2026-11-27T18:00:00Z");
  assert.equal(metadata.lastErrorAt, undefined);
  assert.equal(metadata.isFinal, false);
});

test("configuredShares reads multivariate allocations from experiment detail", () => {
  const shares = configuredShares({
    feature: {
      multivariate_options: [
        { default_percentage_allocation: 50 },
        { default_percentage_allocation: 50 },
      ],
    },
  });
  assert.deepEqual(shares, [0.5, 0.5]);
});

test("configuredShares returns undefined when no allocations are present", () => {
  assert.equal(configuredShares({ feature: { multivariate_options: [] } }), undefined);
  assert.equal(configuredShares({}), undefined);
});

test("adaptExposures sums the upstream ExposuresSummary shape", () => {
  const response = {
    exposures: {
      as_of: "2026-11-27T18:00:00Z",
      payload: {
        excluded_identities: 12,
        timeseries: {
          granularity: "day",
          points: [
            { bucket: "2026-11-27", new_identities: { control: 40, treatment: 10 } },
            { bucket: "2026-11-28", new_identities: { control: 60, treatment: 90 } },
          ],
        },
      },
    },
  };
  const report = adaptExposures(unwrapExposures(response));
  assert.deepEqual(report.perVariant, { control: 100, treatment: 100 });
  assert.equal(report.excluded, 12);
  assert.equal(report.buckets, 2);
});

test("adaptExposures fails loudly on an unknown shape", () => {
  assert.throws(() => adaptExposures({ mystery: true }), /Unsupported exposures/);
});

test("adaptPayload reads a results payload and fails loudly on an unknown shape", () => {
  const input = adaptPayload({
    variants: [
      { name: "control", n: 10, conversions: 1 },
      { name: "treatment", n: 10, conversions: 2 },
    ],
  });
  assert.equal(input.variants.length, 2);
  assert.equal(input.variants[0].sum, 1);
  assert.throws(
    () => adaptPayload({ mystery: true }),
    /Unsupported Flagsmith results payload.*mystery/,
  );
});
