import test from "node:test";
import assert from "node:assert/strict";
import { run, resolveConnection } from "./cli.js";

test("credentials fall back to environment variables", () => {
  const connection = resolveConnection(
    { environment: "env-key", experiment: "7" },
    {
      FLAGSMITH_TOKEN: "env-token",
      FLAGSMITH_API_URL: "http://localhost:8000",
    },
  );
  assert.equal(connection.apiUrl, "http://localhost:8000");
  assert.equal(connection.token, "env-token");
});

test("explicit CLI flags override environment credentials", () => {
  const connection = resolveConnection(
    { "api-url": "https://flagsmith.example", token: "flag-token" },
    { FLAGSMITH_TOKEN: "env-token", FLAGSMITH_API_URL: "http://localhost:8000" },
  );
  assert.equal(connection.apiUrl, "https://flagsmith.example");
  assert.equal(connection.token, "flag-token");
});

test("exposures demo reports per-variant counts and exclusions", async () => {
  const result = await run(["exposures", "--demo"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /EXPOSURES/);
  assert.match(result.stdout, /control/);
  assert.match(result.stdout, /excluded/i);
});

test("demo broken scenario exits 1 and names both root causes", async () => {
  const result = await run(["check", "--demo", "--scenario", "broken"]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /VERDICT: INVALID/);
  assert.match(result.stdout, /Sample ratio mismatch/);
  assert.match(result.stdout, /312 identities/);
});

test("demo fixed scenario exits 0 and reports a trustworthy result", async () => {
  const result = await run(["check", "--demo", "--scenario", "fixed"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /VERDICT: TRUSTWORTHY/);
});

test("json mode emits parseable output with the verdict", async () => {
  const result = await run(["check", "--demo", "--json"]);
  const parsed = JSON.parse(result.stdout) as { verdict: string };
  assert.equal(parsed.verdict, "INVALID");
});

test("malformed expected shares fail loudly instead of passing the gate", async () => {
  const result = await run([
    "check",
    "--demo",
    "--scenario",
    "fixed",
    "--expected-shares",
    "0.5",
  ]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /expected shares/);
});

test("preflight reports when traffic is insufficient", async () => {
  const result = await run([
    "preflight",
    "--baseline",
    "0.05",
    "--mde",
    "0.1",
    "--traffic",
    "10",
    "--days-until",
    "2",
  ]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /NOT ON TRACK/);
});
