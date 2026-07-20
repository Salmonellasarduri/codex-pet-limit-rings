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

function asPetDimension(value) {
  const parsed = asNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function frameFromAbsoluteBounds(bounds) {
  if (!bounds || typeof bounds !== "object") {
    return null;
  }

  const x = asNumber(bounds.x);
  const y = asNumber(bounds.y);
  const width = asPetDimension(bounds.width);
  const height = asPetDimension(bounds.height);
  if ([x, y, width, height].some((value) => value === null)) {
    return null;
  }

  return { x, y, width, height };
}

function frameFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const anchorFrame = frameFromAbsoluteBounds(snapshot.anchor);
  if (anchorFrame) {
    return anchorFrame;
  }

  const mascot = snapshot.mascot;
  if (!mascot || typeof mascot !== "object") {
    return null;
  }

  const baseX = asNumber(snapshot.x);
  const baseY = asNumber(snapshot.y);
  const left = asNumber(mascot.left);
  const top = asNumber(mascot.top);
  const width = asPetDimension(mascot.width);
  const height = asPetDimension(mascot.height);
  if ([baseX, baseY, left, top, width, height].some((value) => value === null)) {
    return null;
  }

  return {
    x: baseX + left,
    y: baseY + top,
    width,
    height
  };
}

function findPetFrame(bounds) {
  const directFrame = frameFromSnapshot(bounds);
  if (directFrame) {
    return directFrame;
  }

  const byDisplayId = bounds && bounds.byDisplayId;
  if (!byDisplayId || typeof byDisplayId !== "object") {
    return null;
  }

  const currentDisplay = byDisplayId[String(bounds.displayId)];
  const currentDisplayFrame = frameFromSnapshot(currentDisplay);
  if (currentDisplayFrame) {
    return currentDisplayFrame;
  }

  const currentX = asNumber(bounds.x);
  const currentY = asNumber(bounds.y);
  if (currentX === null || currentY === null) {
    return null;
  }

  // 2026-07-21: Reading only bounds.mascot fails after Codex changes a display ID because the top level keeps only the pet origin.
  // Removing this exact-origin history fallback makes the rings disappear while the pet remains open.
  for (const snapshot of Object.values(byDisplayId)) {
    const historicalFrame = frameFromSnapshot(snapshot);
    if (historicalFrame && historicalFrame.x === currentX && historicalFrame.y === currentY) {
      return historicalFrame;
    }
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
  if (!open || !bounds) {
    return { open, avatarId, petFrame: null };
  }

  return {
    open,
    avatarId,
    petFrame: findPetFrame(bounds)
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
