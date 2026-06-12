const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  defaultStatePath,
  emptyClaudeState,
  parseAuthToken,
  parseOauthUsagePayload,
  parseStatuslineState,
  readLatestUsage
} = require("../src/claudeUsage");

const NOW = Date.UTC(2026, 5, 12, 12, 0, 0);

test("parseAuthToken reads local Claude OAuth token shape and rejects expired tokens", () => {
  const valid = parseAuthToken(
    { claudeAiOauth: { accessToken: "token-value", expiresAt: NOW + 3600000, subscriptionType: "max" } },
    NOW
  );
  assert.deepEqual(valid, { token: "token-value", planType: "max" });

  assert.equal(parseAuthToken({ claudeAiOauth: { accessToken: "token-value", expiresAt: NOW - 1 } }, NOW), null);
  assert.equal(parseAuthToken({ claudeAiOauth: {} }, NOW), null);
  assert.equal(parseAuthToken({}, NOW), null);
});

test("parseOauthUsagePayload maps oauth usage buckets into remaining percentages", () => {
  const state = parseOauthUsagePayload(
    {
      five_hour: { utilization: 37.0, resets_at: "2026-06-12T14:40:00.831747+00:00" },
      seven_day: { utilization: 78.0, resets_at: "2026-06-13T16:59:59.831765+00:00" },
      seven_day_opus: null,
      seven_day_sonnet: { utilization: 17.0, resets_at: "2026-06-13T16:59:58.831771+00:00" }
    },
    "live",
    "max"
  );

  assert.equal(state.planType, "max");
  assert.equal(state.source, "live");
  assert.equal(state.primary.remainingPercent, 63);
  assert.equal(state.primary.windowMinutes, 300);
  assert.equal(state.primary.resetAt, Date.parse("2026-06-12T14:40:00.831747+00:00"));
  assert.equal(state.secondary.remainingPercent, 22);
  assert.equal(state.secondary.windowMinutes, 10080);
  assert.deepEqual(state.additional.map((item) => item.name), ["Sonnet wk"]);
  assert.equal(state.additional[0].bucket.remainingPercent, 83);
});

test("parseStatuslineState reads tee file with session info and rate limits", () => {
  const state = parseStatuslineState(
    JSON.stringify({
      updatedAt: NOW - 120000,
      sessionId: "abc",
      cwd: "E:\\Project",
      model: "Fable 5",
      context_window: { used_percentage: 42.5 },
      rate_limits: {
        five_hour: { used_percentage: 37 },
        seven_day: { used_percentage: 78 }
      }
    }),
    NOW
  );

  assert.equal(state.session.model, "Fable 5");
  assert.equal(state.session.contextUsedPercent, 42.5);
  assert.equal(state.session.ageMs, 120000);
  assert.equal(state.limits.source, "statusline");
  assert.equal(state.limits.primary.remainingPercent, 63);
  assert.equal(state.limits.secondary.remainingPercent, 22);
});

test("parseStatuslineState tolerates missing rate limits", () => {
  const state = parseStatuslineState(
    JSON.stringify({ updatedAt: NOW, model: "Fable 5", context_window: { used_percentage: 10 } }),
    NOW
  );
  assert.equal(state.limits, null);
  assert.equal(state.session.model, "Fable 5");
});

test("readLatestUsage prefers live data and keeps statusline session info", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-rings-home-"));
  fs.writeFileSync(
    path.join(tmpDir, ".credentials.json"),
    JSON.stringify({ claudeAiOauth: { accessToken: "token", expiresAt: Date.now() + 3600000, subscriptionType: "max" } })
  );
  fs.writeFileSync(
    defaultStatePath(tmpDir),
    JSON.stringify({
      updatedAt: Date.now(),
      model: "Fable 5",
      rate_limits: { five_hour: { used_percentage: 90 } }
    })
  );

  const state = await readLatestUsage({
    claudeHome: tmpDir,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ five_hour: { utilization: 25 }, seven_day: { utilization: 50 } })
    })
  });

  assert.equal(state.limits.source, "live");
  assert.equal(state.limits.primary.remainingPercent, 75);
  assert.equal(state.session.model, "Fable 5");
});

test("readLatestUsage falls back to statusline tee file when live usage fails", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-rings-home-"));
  fs.writeFileSync(
    defaultStatePath(tmpDir),
    JSON.stringify({
      updatedAt: Date.now(),
      model: "Fable 5",
      rate_limits: { five_hour: { used_percentage: 37 }, seven_day: { used_percentage: 78 } }
    })
  );

  const state = await readLatestUsage({
    claudeHome: tmpDir,
    fetchImpl: async () => {
      throw new Error("network should not be required for fallback");
    }
  });

  assert.equal(state.limits.source, "statusline");
  assert.equal(state.limits.primary.remainingPercent, 63);
  assert.equal(state.limits.secondary.remainingPercent, 22);
});

test("readLatestUsage returns empty state when no source is available", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-rings-home-"));
  const state = await readLatestUsage({ claudeHome: tmpDir, fetchImpl: null });
  assert.equal(state.limits.source, "none");
  assert.equal(state.session, null);
  assert.deepEqual(Object.keys(state), Object.keys(emptyClaudeState()));
});
