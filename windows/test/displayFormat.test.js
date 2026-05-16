const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatDuration,
  formatResetText,
  formatWindowLabel,
  limitRows
} = require("../src/displayFormat");

test("formatWindowLabel uses compact time labels", () => {
  assert.equal(formatWindowLabel({ windowMinutes: 240 }, "Short"), "4h");
  assert.equal(formatWindowLabel({ windowMinutes: 10080 }, "Short"), "Week");
  assert.equal(formatWindowLabel({ windowMinutes: 45 }, "Short"), "45m");
  assert.equal(formatWindowLabel({}, "Short"), "Short");
});

test("formatResetText renders short remaining time", () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  assert.equal(formatResetText({ resetAt: (now + 63 * 60 * 1000) / 1000 }, now), "1:03");
  assert.equal(formatDuration(59 * 60), "59m");
});

test("limitRows renders outer and inner rows", () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  const rows = limitRows(
    {
      primary: { remainingPercent: 91, windowMinutes: 240, resetAt: (now + 63 * 60 * 1000) / 1000 },
      secondary: { remainingPercent: 82, windowMinutes: 10080 }
    },
    now
  );
  assert.deepEqual(rows, [
    { label: "4h", percent: "91%", reset: "1:03", role: "outer" },
    { label: "Week", percent: "82%", reset: "", role: "inner" }
  ]);
});
