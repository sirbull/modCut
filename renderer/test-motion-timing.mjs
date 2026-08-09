import assert from "node:assert/strict";
import test from "node:test";

import { EPILOG_ZING_TIMING, motionTimingForMachine, targetMotionSpeed, trapezoidPlan } from "./motion-timing.mjs";

test("Epilog Zing timing uses measured vector and travel speeds", () => {
  const timing = motionTimingForMachine({ driver: "Epilog Zing", maxFeed: 12000 });
  assert.equal(timing.vectorSpeedMmS, 27.9);
  assert.equal(timing.travelSpeedMmS, 214.5);
  assert.equal(targetMotionSpeed(10, timing.vectorSpeedMmS), 2.79);
});

test("a long 500 DPI Epilog vector agrees with the VisiCut speed measurement", () => {
  const measuredDistanceMm = 20000 / 500 * 25.4;
  const plan = trapezoidPlan(measuredDistanceMm, EPILOG_ZING_TIMING.vectorSpeedMmS, EPILOG_ZING_TIMING.vectorAccelerationMmS2);
  assert.ok(plan.duration > 36 && plan.duration < 37.5);
});

test("short paths are acceleration-limited instead of instantly reaching full speed", () => {
  const plan = trapezoidPlan(2, 27.9, 250);
  assert.ok(plan.peakSpeed < 27.9);
  assert.ok(plan.duration > 2 / 27.9 * 2);
  assert.equal(plan.timeAtDistance(2), plan.duration);
});

test("machine-specific calibration overrides the defaults", () => {
  const timing = motionTimingForMachine({ driver: "Epilog Zing", motionTiming: { vectorSpeedMmS: 25, vectorAccelerationMmS2: 180 } });
  assert.equal(timing.vectorSpeedMmS, 25);
  assert.equal(timing.vectorAccelerationMmS2, 180);
  assert.equal(timing.travelSpeedMmS, 214.5);
});
