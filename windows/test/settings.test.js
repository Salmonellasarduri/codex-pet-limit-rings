const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  RingSettingsStore,
  normalizeHexColor,
  resolvedRingStyle
} = require("../src/settings");

test("normalizeHexColor accepts six-digit colors only", () => {
  assert.equal(normalizeHexColor("#ABC123"), "#abc123");
  assert.equal(normalizeHexColor("ABC123"), null);
  assert.equal(normalizeHexColor("#abc"), null);
});

test("RingSettingsStore saves per-avatar color and opacity settings", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-rings-settings-"));
  const store = new RingSettingsStore(path.join(tmpDir, "settings.json"));

  store.setColorPreset("custom:inanna", "outer", "sakura");
  store.setCustomColor("custom:inanna", "inner", "#123456");
  store.setOpacityPreset("custom:inanna", "outer", "55");

  const settings = store.getForAvatar("custom:inanna");
  assert.equal(settings.colors.outer.preset, "sakura");
  assert.equal(settings.colors.inner.custom, "#123456");
  assert.equal(settings.opacity.outer, "55");

  const style = resolvedRingStyle(settings);
  assert.equal(style.outerColor, "#ff7ab3");
  assert.equal(style.innerColor, "#123456");
  assert.equal(style.outerOpacity, 0.55);
});

test("RingSettingsStore reset clears only the selected avatar", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-rings-settings-"));
  const store = new RingSettingsStore(path.join(tmpDir, "settings.json"));

  store.setColorPreset("custom:inanna", "outer", "ruby");
  store.setColorPreset("custom:other", "outer", "lime");
  store.resetAvatar("custom:inanna");

  assert.equal(store.getForAvatar("custom:inanna").colors.outer.preset, "default");
  assert.equal(store.getForAvatar("custom:other").colors.outer.preset, "lime");
});
