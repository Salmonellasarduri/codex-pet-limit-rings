const test = require("node:test");
const assert = require("node:assert/strict");
const {
  claudeBarRows,
  claudeSessionLine,
  formatAge,
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

test("claudeBarRows renders five-hour and weekly bars with remaining percent", () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  const rows = claudeBarRows(
    {
      limits: {
        primary: { remainingPercent: 63, windowMinutes: 300, resetAt: now + 63 * 60 * 1000 },
        secondary: { remainingPercent: 22, windowMinutes: 10080 }
      }
    },
    now
  );
  assert.deepEqual(rows, [
    { label: "5h", percent: "63%", reset: "1:03", remainingPercent: 63, role: "outer" },
    { label: "Week", percent: "22%", reset: "", remainingPercent: 22, role: "inner" }
  ]);
});

test("claudeBarRows tolerates missing limits", () => {
  const rows = claudeBarRows({ limits: { primary: null, secondary: null } });
  assert.equal(rows[0].percent, "--");
  assert.equal(rows[0].remainingPercent, null);
  assert.equal(rows[1].label, "Week");
});

test("claudeSessionLine joins model and context usage", () => {
  assert.equal(claudeSessionLine({ session: { model: "Fable 5", contextUsedPercent: 42.5 } }), "Fable 5 · ctx 43%");
  assert.equal(claudeSessionLine({ session: { model: "Fable 5" } }), "Fable 5");
  assert.equal(claudeSessionLine({ session: null }), "");
});

test("formatAge renders compact relative ages", () => {
  assert.equal(formatAge(30 * 1000), "now");
  assert.equal(formatAge(5 * 60 * 1000), "5m ago");
  assert.equal(formatAge(2 * 60 * 60 * 1000), "2h ago");
  assert.equal(formatAge(null), "");
});
