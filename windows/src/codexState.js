const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function getDefaultCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseCodexState(raw) {
  const root = typeof raw === "string" ? JSON.parse(raw) : raw;
  const isOpen = root["electron-avatar-overlay-open"];
  const open = typeof isOpen === "boolean" ? isOpen : true;

  const atomState = root["electron-persisted-atom-state"] || {};
  const avatarId =
    typeof atomState["selected-avatar-id"] === "string" && atomState["selected-avatar-id"].length > 0
      ? atomState["selected-avatar-id"]
      : null;

  const bounds = root["electron-avatar-overlay-bounds"];
  const mascot = bounds && bounds.mascot;
  if (!open || !bounds || !mascot) {
    return { open, avatarId, petFrame: null };
  }

  const baseX = asNumber(bounds.x);
  const baseY = asNumber(bounds.y);
  const left = asNumber(mascot.left);
  const top = asNumber(mascot.top);
  const width = asNumber(mascot.width);
  const height = asNumber(mascot.height);
  if ([baseX, baseY, left, top, width, height].some((value) => value === null)) {
    return { open, avatarId, petFrame: null };
  }

  return {
    open,
    avatarId,
    petFrame: {
      x: baseX + left,
      y: baseY + top,
      width,
      height
    }
  };
}

function readCodexState(statePath = path.join(getDefaultCodexHome(), ".codex-global-state.json")) {
  const raw = fs.readFileSync(statePath, "utf8");
  return parseCodexState(raw);
}

module.exports = {
  getDefaultCodexHome,
  parseCodexState,
  readCodexState
};
