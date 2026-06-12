const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const LIVE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA_HEADER = "oauth-2025-04-20";
const FIVE_HOUR_MINUTES = 300;
const SEVEN_DAY_MINUTES = 10080;
const TOKEN_EXPIRY_MARGIN_MS = 30000;

function getDefaultClaudeHome() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function asPercent(value) {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 100) : null;
}

function asResetAt(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bucketFrom(payload, windowMinutes) {
  if (!payload) {
    return null;
  }
  const usedPercent = asPercent(
    typeof payload.utilization === "number"
      ? payload.utilization
      : typeof payload.used_percentage === "number"
        ? payload.used_percentage
        : payload.used_percent
  );
  if (usedPercent === null) {
    return null;
  }
  return {
    usedPercent,
    remainingPercent: clamp(100 - usedPercent, 0, 100),
    windowMinutes,
    resetAt: asResetAt(payload.resets_at !== undefined ? payload.resets_at : payload.reset_at)
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

function emptyClaudeState() {
  return { limits: emptyLimitState(), session: null };
}

function parseOauthUsagePayload(payload, source = "live", planType = null) {
  const additional = [];
  for (const [key, label] of [
    ["seven_day_sonnet", "Sonnet wk"],
    ["seven_day_opus", "Opus wk"]
  ]) {
    const bucket = bucketFrom(payload[key], SEVEN_DAY_MINUTES);
    if (bucket) {
      additional.push({ name: label, bucket });
    }
  }
  return {
    planType,
    primary: bucketFrom(payload.five_hour, FIVE_HOUR_MINUTES),
    secondary: bucketFrom(payload.seven_day, SEVEN_DAY_MINUTES),
    additional,
    observedAt: new Date().toISOString(),
    source
  };
}

function parseAuthToken(raw, nowMs = Date.now()) {
  const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  const oauth = payload && payload.claudeAiOauth;
  if (!oauth || typeof oauth.accessToken !== "string" || oauth.accessToken.length === 0) {
    return null;
  }
  if (typeof oauth.expiresAt === "number" && oauth.expiresAt <= nowMs + TOKEN_EXPIRY_MARGIN_MS) {
    return null;
  }
  return {
    token: oauth.accessToken,
    planType: typeof oauth.subscriptionType === "string" ? oauth.subscriptionType : null
  };
}

function readAccessToken(authPath = path.join(getDefaultClaudeHome(), ".credentials.json"), nowMs = Date.now()) {
  return parseAuthToken(fs.readFileSync(authPath, "utf8"), nowMs);
}

async function readLiveUsage({ authPath, fetchImpl = globalThis.fetch, nowMs = Date.now() } = {}) {
  if (typeof fetchImpl !== "function") {
    return null;
  }

  let auth;
  try {
    auth = readAccessToken(authPath, nowMs);
  } catch {
    return null;
  }
  if (!auth) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetchImpl(LIVE_USAGE_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${auth.token}`,
        "anthropic-beta": OAUTH_BETA_HEADER
      },
      signal: controller.signal
    });
    if (!response || !response.ok) {
      return null;
    }
    return parseOauthUsagePayload(await response.json(), "live", auth.planType);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseStatuslineState(raw, nowMs = Date.now()) {
  const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const updatedAt = typeof payload.updatedAt === "number" ? payload.updatedAt : null;
  const contextWindow = payload.context_window || {};
  const session = {
    sessionId: typeof payload.sessionId === "string" ? payload.sessionId : null,
    cwd: typeof payload.cwd === "string" ? payload.cwd : null,
    model: typeof payload.model === "string" ? payload.model : null,
    contextUsedPercent: asPercent(contextWindow.used_percentage),
    updatedAt,
    ageMs: updatedAt !== null ? Math.max(0, nowMs - updatedAt) : null
  };

  const rateLimits = payload.rate_limits || {};
  const primary = bucketFrom(rateLimits.five_hour, FIVE_HOUR_MINUTES);
  const secondary = bucketFrom(rateLimits.seven_day, SEVEN_DAY_MINUTES);
  const limits =
    primary || secondary
      ? {
          planType: null,
          primary,
          secondary,
          additional: [],
          observedAt: updatedAt !== null ? new Date(updatedAt).toISOString() : new Date(nowMs).toISOString(),
          source: "statusline"
        }
      : null;

  return { limits, session };
}

function readStatuslineState(statePath, nowMs = Date.now()) {
  try {
    return parseStatuslineState(fs.readFileSync(statePath, "utf8"), nowMs);
  } catch {
    return null;
  }
}

function defaultStatePath(claudeHome = getDefaultClaudeHome()) {
  return path.join(claudeHome, "pet-ring-state.json");
}

async function readLatestUsage({
  claudeHome = getDefaultClaudeHome(),
  authPath = path.join(claudeHome, ".credentials.json"),
  statePath = defaultStatePath(claudeHome),
  fetchImpl = globalThis.fetch,
  nowMs = Date.now()
} = {}) {
  const fromStatusline = readStatuslineState(statePath, nowMs);
  const live = await readLiveUsage({ authPath, fetchImpl, nowMs });
  return {
    limits: live || (fromStatusline && fromStatusline.limits) || emptyLimitState(),
    session: (fromStatusline && fromStatusline.session) || null
  };
}

module.exports = {
  LIVE_USAGE_URL,
  defaultStatePath,
  emptyClaudeState,
  emptyLimitState,
  getDefaultClaudeHome,
  parseAuthToken,
  parseOauthUsagePayload,
  parseStatuslineState,
  readLatestUsage,
  readLiveUsage,
  readStatuslineState
};
