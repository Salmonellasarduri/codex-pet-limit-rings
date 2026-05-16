const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_AVATAR_KEY = "__default__";

const RING_COLOR_PRESETS = [
  {
    id: "default",
    title: "Default",
    colors: {
      outer: "#4cebc2",
      inner: "#60b2ff"
    }
  },
  {
    id: "sakura",
    title: "Sakura",
    colors: {
      outer: "#ff7ab3",
      inner: "#c79eff"
    }
  },
  {
    id: "amber",
    title: "Amber",
    colors: {
      outer: "#ffaa3d",
      inner: "#ffdb57"
    }
  },
  {
    id: "purple",
    title: "Purple",
    colors: {
      outer: "#b87aff",
      inner: "#d194ff"
    }
  },
  {
    id: "brown",
    title: "Brown",
    colors: {
      outer: "#c7854d",
      inner: "#ad7a52"
    }
  },
  {
    id: "emerald",
    title: "Emerald",
    colors: {
      outer: "#38f274",
      inner: "#61e09e"
    }
  },
  {
    id: "aqua",
    title: "Aqua",
    colors: {
      outer: "#24dbff",
      inner: "#80f5ff"
    }
  },
  {
    id: "ruby",
    title: "Ruby",
    colors: {
      outer: "#ff3d6b",
      inner: "#ff7a8f"
    }
  },
  {
    id: "lime",
    title: "Lime",
    colors: {
      outer: "#b3ff3d",
      inner: "#dbff66"
    }
  },
  {
    id: "graphite",
    title: "Graphite",
    colors: {
      outer: "#c7d1e0",
      inner: "#8a99ad"
    }
  }
];

const RING_OPACITY_PRESETS = [
  { id: "100", title: "100%", opacity: 1 },
  { id: "85", title: "85%", opacity: 0.85 },
  { id: "70", title: "70%", opacity: 0.7 },
  { id: "55", title: "55%", opacity: 0.55 },
  { id: "40", title: "40%", opacity: 0.4 }
];

function defaultRingSettings() {
  return {
    colors: {
      outer: { preset: "default", custom: null },
      inner: { preset: "default", custom: null }
    },
    opacity: {
      outer: "100",
      inner: "100"
    }
  };
}

function normalizeHexColor(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

function presetFor(id) {
  return RING_COLOR_PRESETS.find((preset) => preset.id === id) || RING_COLOR_PRESETS[0];
}

function opacityPresetFor(id) {
  return RING_OPACITY_PRESETS.find((preset) => preset.id === id) || RING_OPACITY_PRESETS[0];
}

function avatarKey(avatarId) {
  return typeof avatarId === "string" && avatarId.length > 0 ? avatarId : DEFAULT_AVATAR_KEY;
}

function cloneSettings(value) {
  return JSON.parse(JSON.stringify(value));
}

class RingSettingsStore {
  constructor(settingsPath) {
    this.settingsPath = settingsPath;
    this.data = {
      avatars: {}
    };
    this.load();
  }

  load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.settingsPath, "utf8"));
    } catch {
      this.data = { avatars: {} };
    }
    if (!this.data || typeof this.data !== "object" || !this.data.avatars) {
      this.data = { avatars: {} };
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    fs.writeFileSync(this.settingsPath, `${JSON.stringify(this.data, null, 2)}\n`);
  }

  getForAvatar(avatarId) {
    const settings = cloneSettings(defaultRingSettings());
    const stored = this.data.avatars[avatarKey(avatarId)] || {};

    for (const ring of ["outer", "inner"]) {
      const color = stored.colors && stored.colors[ring];
      if (color && RING_COLOR_PRESETS.some((preset) => preset.id === color.preset)) {
        settings.colors[ring].preset = color.preset;
      }
      const custom = color && normalizeHexColor(color.custom);
      if (custom) {
        settings.colors[ring].custom = custom;
      }

      const opacity = stored.opacity && stored.opacity[ring];
      if (RING_OPACITY_PRESETS.some((preset) => preset.id === opacity)) {
        settings.opacity[ring] = opacity;
      }
    }

    return settings;
  }

  setColorPreset(avatarId, ring, presetId) {
    if (!["outer", "inner"].includes(ring) || !RING_COLOR_PRESETS.some((preset) => preset.id === presetId)) {
      return;
    }
    const settings = this.getForAvatar(avatarId);
    settings.colors[ring] = { preset: presetId, custom: null };
    this.data.avatars[avatarKey(avatarId)] = settings;
    this.save();
  }

  setCustomColor(avatarId, ring, color) {
    const normalized = normalizeHexColor(color);
    if (!["outer", "inner"].includes(ring) || !normalized) {
      return;
    }
    const settings = this.getForAvatar(avatarId);
    settings.colors[ring] = { preset: "custom", custom: normalized };
    this.data.avatars[avatarKey(avatarId)] = settings;
    this.save();
  }

  setOpacityPreset(avatarId, ring, presetId) {
    if (!["outer", "inner"].includes(ring) || !RING_OPACITY_PRESETS.some((preset) => preset.id === presetId)) {
      return;
    }
    const settings = this.getForAvatar(avatarId);
    settings.opacity[ring] = presetId;
    this.data.avatars[avatarKey(avatarId)] = settings;
    this.save();
  }

  resetAvatar(avatarId) {
    delete this.data.avatars[avatarKey(avatarId)];
    this.save();
  }
}

function resolvedRingStyle(settings) {
  const outerPreset = presetFor(settings.colors.outer.preset);
  const innerPreset = presetFor(settings.colors.inner.preset);
  const outerColor = settings.colors.outer.custom || outerPreset.colors.outer;
  const innerColor = settings.colors.inner.custom || innerPreset.colors.inner;

  return {
    outerColor,
    innerColor,
    outerOpacity: opacityPresetFor(settings.opacity.outer).opacity,
    innerOpacity: opacityPresetFor(settings.opacity.inner).opacity
  };
}

module.exports = {
  DEFAULT_AVATAR_KEY,
  RING_COLOR_PRESETS,
  RING_OPACITY_PRESETS,
  RingSettingsStore,
  defaultRingSettings,
  normalizeHexColor,
  opacityPresetFor,
  presetFor,
  resolvedRingStyle
};
