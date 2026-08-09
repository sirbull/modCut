// Empirical Epilog vector speeds measured by the original VisiCut project at
// 500 DPI: about 28 mm/s with the laser on and 200–225 mm/s with it off.
// See Appendix C of https://hci.rwth-aachen.de/publications/oster2011a.pdf
export const EPILOG_ZING_TIMING = Object.freeze({
  vectorSpeedMmS: 27.9,
  travelSpeedMmS: 214.5,
  rasterSpeedMmS: 900,
  vectorAccelerationMmS2: 250,
  travelAccelerationMmS2: 1200,
  rasterAccelerationMmS2: 4000,
  vectorPathDelayS: 0.008,
  rasterLineDelayS: 0.08,
  jobOverheadS: 3,
});

export function defaultMotionTiming(driver, maxFeed = 12000) {
  if (/^epilog\s+zing$/i.test(String(driver || ""))) return { ...EPILOG_ZING_TIMING };
  const maximum = Math.max(1, Number(maxFeed) || 12000) / 60;
  return {
    vectorSpeedMmS: maximum,
    travelSpeedMmS: maximum,
    rasterSpeedMmS: maximum,
    vectorAccelerationMmS2: 500,
    travelAccelerationMmS2: 800,
    rasterAccelerationMmS2: 800,
    vectorPathDelayS: 0.005,
    rasterLineDelayS: 0.02,
    jobOverheadS: 2,
  };
}

export function motionTimingForMachine(machine = {}) {
  const defaults = defaultMotionTiming(machine.driver, machine.maxFeed);
  const saved = machine.motionTiming || {};
  const positive = (key) => Math.max(0.001, Number(saved[key]) || defaults[key]);
  const nonnegative = (key) => Number.isFinite(Number(saved[key])) ? Math.max(0, Number(saved[key])) : defaults[key];
  return {
    ...defaults,
    vectorSpeedMmS: positive("vectorSpeedMmS"),
    travelSpeedMmS: positive("travelSpeedMmS"),
    rasterSpeedMmS: positive("rasterSpeedMmS"),
    vectorAccelerationMmS2: positive("vectorAccelerationMmS2"),
    travelAccelerationMmS2: positive("travelAccelerationMmS2"),
    rasterAccelerationMmS2: positive("rasterAccelerationMmS2"),
    vectorPathDelayS: nonnegative("vectorPathDelayS"),
    rasterLineDelayS: nonnegative("rasterLineDelayS"),
    jobOverheadS: nonnegative("jobOverheadS"),
  };
}

export function targetMotionSpeed(speedPercent, maximumMmS) {
  return Math.max(0.001, maximumMmS * Math.max(1, Math.min(100, Number(speedPercent) || 1)) / 100);
}

export function trapezoidPlan(distanceMm, maximumMmS, accelerationMmS2) {
  const distance = Math.max(0, Number(distanceMm) || 0);
  const maximum = Math.max(0.001, Number(maximumMmS) || 0.001);
  const acceleration = Math.max(0.001, Number(accelerationMmS2) || 0.001);
  if (!distance) return { duration: 0, timeAtDistance: () => 0, peakSpeed: 0 };

  const fullSpeedRampDistance = maximum * maximum / acceleration;
  const triangular = distance <= fullSpeedRampDistance;
  const peakSpeed = triangular ? Math.sqrt(distance * acceleration) : maximum;
  const accelerationDistance = triangular ? distance / 2 : maximum * maximum / (2 * acceleration);
  const accelerationTime = peakSpeed / acceleration;
  const cruiseDistance = Math.max(0, distance - 2 * accelerationDistance);
  const cruiseTime = cruiseDistance / peakSpeed;
  const duration = 2 * accelerationTime + cruiseTime;

  const timeAtDistance = (input) => {
    const position = Math.max(0, Math.min(distance, Number(input) || 0));
    if (position <= accelerationDistance) return Math.sqrt(2 * position / acceleration);
    if (position < distance - accelerationDistance) return accelerationTime + (position - accelerationDistance) / peakSpeed;
    return duration - Math.sqrt(2 * (distance - position) / acceleration);
  };
  return { duration, timeAtDistance, peakSpeed };
}
