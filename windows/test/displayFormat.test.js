const test = require("node:test");
const assert = require("node:assert/strict");
const {
  claudeSessionLine,
  fiveHourBarRows,
  formatAge,
  formatDuration,
  formatResetText,
  formatWindowLabel,
  weeklyRingRows
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

test("weeklyRingRows pairs Codex and Claude weekly buckets", () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  const rows = weeklyRingRows(
    { secondary: { remainingPercent: 82, windowMinutes: 10080, resetAt: (now + 30 * 60 * 60 * 1000) / 1000 } },
    { limits: { secondary: { remainingPercent: 22, windowMinutes: 10080, resetAt: now + 63 * 60 * 1000 } } },
    now
  );
  assert.deepEqual(rows, [
    { label: "Codex", percent: "82%", reset: "30:00", role: "outer" },
    { label: "Claude", percent: "22%", reset: "1:03", role: "inner" }
  ]);
});

test("weeklyRingRows tolerates missing data", () => {
  const rows = weeklyRingRows(null, null);
  assert.deepEqual(rows, [
    { label: "Codex", percent: "--", reset: "", role: "outer" },
    { label: "Claude", percent: "--", reset: "", role: "inner" }
  ]);
});

test("fiveHourBarRows pairs Codex and Claude short windows with remaining percent", () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  const rows = fiveHourBarRows(
    { primary: { remainingPercent: 91, windowMinutes: 300, resetAt: (now + 63 * 60 * 1000) / 1000 } },
    { limits: { primary: { remainingPercent: 63, windowMinutes: 300, resetAt: now + 45 * 60 * 1000 } } },
    now
  );
  assert.deepEqual(rows, [
    { label: "Codex", percent: "91%", reset: "1:03", remainingPercent: 91, role: "outer" },
    { label: "Claude", percent: "63%", reset: "45m", remainingPercent: 63, role: "inner" }
  ]);
});

test("fiveHourBarRows tolerates missing data", () => {
  const rows = fiveHourBarRows(null, { limits: { primary: null } });
  assert.equal(rows[0].percent, "--");
  assert.equal(rows[0].remainingPercent, null);
  assert.equal(rows[1].percent, "--");
  assert.equal(rows[1].remainingPercent, null);
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
