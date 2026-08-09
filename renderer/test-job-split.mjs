import assert from "node:assert/strict";
import test from "node:test";

import { groupJobOperations, jobFilename } from "./job-split.mjs";

test("a combined job preserves every layer in its original order", () => {
  const ops = [{ op: "Score", color: "green" }, { op: "Cut", color: "red" }];
  assert.deepEqual(groupJobOperations(ops, false), [{ operation: null, ops }]);
  assert.equal(jobFilename("calendar", ".prn", null, 0, 1), "calendar.prn");
});

test("split jobs create one file per operation in first-occurrence order", () => {
  const scoreA = { op: "Score", color: "green" };
  const engrave = { op: "Engrave", color: "black" };
  const scoreB = { op: "Score", color: "blue" };
  const cut = { op: "Cut", color: "red" };
  const groups = groupJobOperations([scoreA, engrave, scoreB, cut], true);

  assert.deepEqual(groups, [
    { operation: "Score", ops: [scoreA, scoreB] },
    { operation: "Engrave", ops: [engrave] },
    { operation: "Cut", ops: [cut] },
  ]);
  assert.deepEqual(groups.map((group, index) => jobFilename("calendar", ".prn", group.operation, index, groups.length)), [
    "calendar-01-score.prn",
    "calendar-02-engrave.prn",
    "calendar-03-cut.prn",
  ]);
});

test("a single split operation still receives a descriptive filename", () => {
  const groups = groupJobOperations([{ op: "Cut", color: "red" }], true);
  assert.equal(jobFilename("calendar", ".prn", groups[0].operation, 0, groups.length), "calendar-cut.prn");
});
