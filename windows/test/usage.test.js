const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractRateLimitJSON,
  parseAuthToken,
  parseUsagePayload,
  readCachedUsage,
  readLatestUsage
} = require("../src/usage");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const initSqlJs = require("sql.js");

test("parseAuthToken reads local Codex ChatGPT token shape", () => {
  assert.equal(parseAuthToken({ tokens: { access_token: "token-value" } }), "token-value");
  assert.equal(parseAuthToken({ tokens: {} }), null);
});

test("parseUsagePayload maps live usage buckets into remaining percentages", () => {
  const state = parseUsagePayload(
    {
      plan_type: "plus",
      rate_limit: {
        primary: { used_percent: 25, window_minutes: 300, reset_at: 1770000000 },
        secondary: { used_percent: 60, window_minutes: 10080 }
      },
      additional_rate_limits: [
        {
          limit_name: "gpt-5.5",
          rate_limit: {
            primary_window: { used_percent: 10 }
          }
        }
      ]
    },
    "live"
  );

  assert.equal(state.planType, "plus");
  assert.equal(state.source, "live");
  assert.equal(state.primary.remainingPercent, 75);
  assert.equal(state.secondary.remainingPercent, 40);
  assert.equal(state.additional[0].name, "gpt-5.5");
  assert.equal(state.additional[0].bucket.remainingPercent, 90);
});

test("extractRateLimitJSON handles nested strings and trailing log text", () => {
  const json = extractRateLimitJSON(
    'prefix {"type":"codex.rate_limits","plan_type":"plus","rate_limits":{"primary":{"used_percent":12}},"message":"brace } in string"} suffix'
  );
  assert.deepEqual(JSON.parse(json), {
    type: "codex.rate_limits",
    plan_type: "plus",
    rate_limits: {
      primary: {
        used_percent: 12
      }
    },
    message: "brace } in string"
  });
});

test("readCachedUsage reads newest codex.rate_limits event from sqlite", async () => {
  const dbPath = await createRateLimitLogDatabase(
    'prefix {"type":"codex.rate_limits","plan_type":"plus","rate_limits":{"primary":{"used_percent":33},"secondary":{"used_percent":44}}}'
  );

  const state = await readCachedUsage(dbPath);
  assert.equal(state.source, "log");
  assert.equal(state.primary.remainingPercent, 67);
  assert.equal(state.secondary.remainingPercent, 56);
});

test("readLatestUsage falls back to cached sqlite when live usage fails", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-rings-home-"));
  const dbPath = await createRateLimitLogDatabase(
    'prefix {"type":"codex.rate_limits","plan_type":"plus","rate_limits":{"primary":{"used_percent":20},"secondary":{"used_percent":70}}}',
    tmpDir
  );

  const state = await readLatestUsage({
    codexHome: tmpDir,
    authPath: path.join(tmpDir, "missing-auth.json"),
    logsPath: dbPath,
    fetchImpl: async () => {
      throw new Error("network should not be required for fallback");
    }
  });

  assert.equal(state.source, "log");
  assert.equal(state.primary.remainingPercent, 80);
  assert.equal(state.secondary.remainingPercent, 30);
});

async function createRateLimitLogDatabase(body, directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-rings-test-"))) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE logs (id INTEGER, ts INTEGER, ts_nanos INTEGER, feedback_log_body TEXT)");
  db.run("INSERT INTO logs VALUES (?, ?, ?, ?)", [1, 100, 0, body]);

  const dbPath = path.join(directory, "logs_2.sqlite");
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();
  return dbPath;
}
