const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");
const { getDefaultCodexHome } = require("./codexState");

const LIVE_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function bucketFromPayload(payload) {
  if (!payload || typeof payload.used_percent !== "number") {
    return null;
  }
  return {
    usedPercent: payload.used_percent,
    remainingPercent: clamp(100 - payload.used_percent, 0, 100),
    windowMinutes: typeof payload.window_minutes === "number" ? payload.window_minutes : null,
    resetAt: typeof payload.reset_at === "number" ? payload.reset_at : null
  };
}

function bucketPair(rateLimit) {
  if (!rateLimit) {
    return { primary: null, secondary: null };
  }
  return {
    primary: bucketFromPayload(rateLimit.primary || rateLimit.primary_window),
    secondary: bucketFromPayload(rateLimit.secondary || rateLimit.secondary_window)
  };
}

function emptyLimitState(source = "none") {
  return {
    planType: null,
    primary: null,
    secondary: null,
    additional: [],
    observedAt: new Date().toISOString(),
    source
  };
}

function parseUsagePayload(payload, source = "live") {
  const pair = bucketPair(payload.rate_limit || payload.rate_limits);
  const additionalPayload = payload.additional_rate_limits || [];
  const additional = Array.isArray(additionalPayload)
    ? additionalPayload
        .map((item) => {
          const name = item.limit_name || item.metered_feature || "Additional";
          const nested = bucketPair(item.rate_limit || item.rate_limits);
          return nested.primary || nested.secondary ? { name, bucket: nested.primary || nested.secondary } : null;
        })
        .filter(Boolean)
    : Object.entries(additionalPayload)
        .map(([name, value]) => {
          const nested = bucketPair(value);
          return nested.primary || nested.secondary ? { name, bucket: nested.primary || nested.secondary } : null;
        })
        .filter(Boolean);

  additional.sort((a, b) => a.name.localeCompare(b.name));

  return {
    planType: payload.plan_type || null,
    primary: pair.primary,
    secondary: pair.secondary,
    additional,
    observedAt: new Date().toISOString(),
    source
  };
}

function parseAuthToken(raw) {
  const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  const token = payload && payload.tokens && payload.tokens.access_token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

function readAccessToken(authPath = path.join(getDefaultCodexHome(), "auth.json")) {
  return parseAuthToken(fs.readFileSync(authPath, "utf8"));
}

async function readLiveUsage({ authPath, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    return null;
  }

  let token;
  try {
    token = readAccessToken(authPath);
  } catch {
    return null;
  }
  if (!token) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetchImpl(LIVE_USAGE_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });
    if (!response || !response.ok) {
      return null;
    }
    return parseUsagePayload(await response.json(), "live");
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractRateLimitJSON(body) {
  const start = body.indexOf('{"type":"codex.rate_limits"');
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = start; index < body.length; index += 1) {
    const char = body[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return body.slice(start, index + 1);
      }
    }
  }
  return null;
}

async function readCachedUsage(logsPath) {
  if (!logsPath || !fs.existsSync(logsPath)) {
    return null;
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(logsPath));
  try {
    const rows = db.exec(`
      SELECT feedback_log_body
      FROM logs
      WHERE feedback_log_body LIKE '%"type":"codex.rate_limits"%'
      ORDER BY ts DESC, ts_nanos DESC, id DESC
      LIMIT 1
    `);
    const body = rows[0] && rows[0].values[0] && rows[0].values[0][0];
    if (typeof body !== "string") {
      return null;
    }
    const json = extractRateLimitJSON(body);
    return json ? parseUsagePayload(JSON.parse(json), "log") : null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function defaultLogsPath(codexHome = getDefaultCodexHome()) {
  const logs2 = path.join(codexHome, "logs_2.sqlite");
  if (fs.existsSync(logs2)) {
    return logs2;
  }
  return path.join(codexHome, "logs_1.sqlite");
}

async function readLatestUsage({
  codexHome = getDefaultCodexHome(),
  authPath = path.join(codexHome, "auth.json"),
  logsPath = defaultLogsPath(codexHome),
  fetchImpl = globalThis.fetch
} = {}) {
  const live = await readLiveUsage({ authPath, fetchImpl });
  if (live) {
    return live;
  }
  const cached = await readCachedUsage(logsPath);
  return cached || emptyLimitState();
}

module.exports = {
  LIVE_USAGE_URL,
  bucketFromPayload,
  defaultLogsPath,
  emptyLimitState,
  extractRateLimitJSON,
  parseAuthToken,
  parseUsagePayload,
  readCachedUsage,
  readLatestUsage
};
