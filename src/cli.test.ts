import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.js";

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
