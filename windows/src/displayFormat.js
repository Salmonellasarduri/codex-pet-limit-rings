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
    const resetMs = bucket.resetAt > 100000000000 ? bucket.resetAt : bucket.resetAt * 1000;
    const remainingSeconds = Math.max(0, Math.round((resetMs - nowMs) / 1000));
    if (remainingSeconds <= 36 * 60 * 60) {
      return `in ${formatDuration(remainingSeconds)}`;
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

  function limitRows(usage, nowMs = Date.now()) {
    const primary = usage && usage.primary;
    const secondary = usage && usage.secondary;
    return [
      {
        label: formatWindowLabel(primary, "Short"),
        percent: formatPercent(primary),
        reset: formatResetText(primary, nowMs),
        role: "outer"
      },
      {
        label: formatWindowLabel(secondary, "Week"),
        percent: formatPercent(secondary),
        reset: formatResetText(secondary, nowMs),
        role: "inner"
      }
    ];
  }

  return {
    formatDuration,
    formatResetText,
    formatWindowLabel,
    limitRows
  };
});
