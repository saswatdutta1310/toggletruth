import test from "node:test";
import assert from "node:assert/strict";
import {
  compareToControl,
  normalCdf,
  srmPValue,
  variance,
} from "./stats.js";

const control = { n: 1000, sum: 50, sumSquares: 50 };
const treatment = { n: 1000, sum: 65, sumSquares: 65 };

test("variance recovers spread from three running totals", () => {
  assert.ok(Math.abs(variance(control) - 0.04754754754754755) < 1e-12);
});

test("compareToControl reproduces the upstream lift, interval and chance to win", () => {
  const result = compareToControl(control, treatment);
  assert.ok(result);
  assert.ok(Math.abs(result.lift - 0.3) < 1e-12);
  assert.ok(Math.abs(result.ciLow - -0.16578112748616686) < 1e-9);
  assert.ok(Math.abs(result.ciHigh - 0.7657811274861668) < 1e-9);
  // A&S 7.1.26 has a documented ~1.5e-7 maximum error; 1e-6 is the honest contract.
  assert.ok(Math.abs(result.chanceToWin - 0.8965925749503911) < 1e-6);
});

test("compareToControl is undefined when control has no positive mean", () => {
  assert.equal(
    compareToControl(
      { n: 10, sum: 0, sumSquares: 0 },
      { n: 10, sum: 5, sumSquares: 5 },
    ),
    null,
  );
});

test("normalCdf matches known values", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.96) - 0.9750021048517795) < 1e-6);
  assert.ok(normalCdf(-1) < 0.16);
});

test("srmPValue is one when the observed split exactly matches the weights", () => {
  assert.equal(srmPValue([500, 500], [0.5, 0.5]), 1);
});

test("srmPValue is tiny when the observed split violates the weights", () => {
  const p = srmPValue([800, 200], [0.5, 0.5]);
  assert.ok(p !== null);
  assert.ok(p < 0.001);
});

test("srmPValue is undefined without traffic", () => {
  assert.equal(srmPValue([0, 0], [0.5, 0.5]), null);
});
