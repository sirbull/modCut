import test from "node:test";
import assert from "node:assert/strict";
import { applyProcessProfile, normalizeProcessProfile, profilesForOperation } from "./process-profiles.mjs";

test("process profiles normalize unsafe and missing values", () => {
  const profile = normalizeProcessProfile({ id: "p", name: "  Photo  ", op: "Engrave", power: 140, speed: 0, dpi: 1200, zOffset: "-1.25" });
  assert.deepEqual({ name: profile.name, power: profile.power, speed: profile.speed, dpi: profile.dpi, zOffset: profile.zOffset },
    { name: "Photo", power: 100, speed: 1, dpi: 1000, zOffset: -1.25 });
});

test("applying an engrave profile updates output and raster controls", () => {
  const layer = { op: "Cut", dpi: 100, dither: "Bayer", bottomUp: false };
  applyProcessProfile(layer, { id: "photo", name: "Photo", op: "Engrave", power: 32, speed: 70, freq: 5000, zOffset: 0.8, dpi: 254, dither: "Grayscale", bottomUp: true });
  assert.deepEqual(layer, { op: "Engrave", power: 32, speed: 70, freq: 5000, zOffset: 0.8, dpi: 254, dither: "Grayscale", bottomUp: true, profileId: "photo" });
});

test("profile choices are filtered by operation", () => {
  const profiles = [{ id: "a", name: "Cut", op: "Cut" }, { id: "b", name: "Photo", op: "Engrave" }];
  assert.deepEqual(profilesForOperation(profiles, "Engrave").map((profile) => profile.id), ["b"]);
});
