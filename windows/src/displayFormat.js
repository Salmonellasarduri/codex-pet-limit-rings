(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LimitRingDisplay = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function formatPercent(bucket) {
    return bucket && typeof bucket.remainingPercent === "number" ? `${Math.round(bucket.remainingPercent)}%` : "--";
  }

  function formatWindowLabel(bucket, fallback) {
    const minutes = bucket && typeof bucket.windowMinutes === "number" ? bucket.windowMinutes : null;
    if (minutes === null) {
      return fallback;
    }
    if (minutes >= 10080) {
      return "Week";
    }
    if (minutes >= 60) {
      const hours = Math.max(1, Math.round(minutes / 60));
      return `${hours}h`;
    }
    return `${Math.max(1, Math.round(minutes))}m`;
  }

  function formatResetText(bucket, nowMs = Date.now()) {
    if (!bucket || typeof bucket.resetAt !== "number") {
      return "";
    }
    const resetMs = bucket.resetAt > 10000000000 ? bucket.resetAt : bucket.resetAt * 1000;
    const remainingSeconds = Math.max(0, Math.round((resetMs - nowMs) / 1000));
    if (remainingSeconds <= 36 * 60 * 60) {
      return formatDuration(remainingSeconds);
    }
    const reset = new Date(resetMs);
    return `${WEEKDAYS[reset.getDay()]} ${reset.getHours()}:${String(reset.getMinutes()).padStart(2, "0")}`;
  }

  function formatDuration(seconds) {
    const totalMinutes = Math.max(0, Math.round(seconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}`;
    }
    return `${minutes}m`;
  }

  function formatAge(ageMs) {
    if (typeof ageMs !== "number" || !Number.isFinite(ageMs) || ageMs < 0) {
      return "";
    }
    const minutes = Math.floor(ageMs / 60000);
    if (minutes < 1) {
      return "now";
    }
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    return `${Math.floor(minutes / 60)}h ago`;
  }

  function weeklyRingRows(usage, claude, nowMs = Date.now()) {
    const codexWeekly = usage && usage.secondary;
    const claudeWeekly = claude && claude.limits && claude.limits.secondary;
    return [
      {
        label: "Codex",
        percent: formatPercent(codexWeekly),
        reset: formatResetText(codexWeekly, nowMs),
        role: "outer"
      },
      {
        label: "Claude",
        percent: formatPercent(claudeWeekly),
        reset: formatResetText(claudeWeekly, nowMs),
        role: "inner"
      }
    ];
  }

  function fiveHourBarRows(usage, claude, nowMs = Date.now()) {
    const codexShort = usage && usage.primary;
    const claudeShort = claude && claude.limits && claude.limits.primary;
    return [
      {
        label: "Codex",
        percent: formatPercent(codexShort),
        reset: formatResetText(codexShort, nowMs),
        remainingPercent: codexShort && typeof codexShort.remainingPercent === "number" ? codexShort.remainingPercent : null,
        role: "outer"
      },
      {
        label: "Claude",
        percent: formatPercent(claudeShort),
        reset: formatResetText(claudeShort, nowMs),
        remainingPercent: claudeShort && typeof claudeShort.remainingPercent === "number" ? claudeShort.remainingPercent : null,
        role: "inner"
      }
    ];
  }

  function claudeSessionLine(claude) {
    const session = claude && claude.session;
    if (!session) {
      return "";
    }
    const parts = [];
    if (session.model) {
      parts.push(session.model);
    }
    if (typeof session.contextUsedPercent === "number") {
      parts.push(`ctx ${Math.round(session.contextUsedPercent)}%`);
    }
    return parts.join(" · ");
  }

  return {
    claudeSessionLine,
    fiveHourBarRows,
    formatAge,
    formatDuration,
    formatResetText,
    formatWindowLabel,
    weeklyRingRows
  };
});
