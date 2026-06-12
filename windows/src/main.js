const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } = require("electron");
const { getDefaultCodexHome, readCodexState } = require("./codexState");
const {
  RING_COLOR_PRESETS,
  RING_OPACITY_PRESETS,
  RingSettingsStore,
  resolvedRingStyle
} = require("./settings");
const { defaultLogsPath, emptyLimitState, readLatestUsage } = require("./usage");
const claudeUsage = require("./claudeUsage");

const STATE_DEBOUNCE_MS = 35;
const CLAUDE_STATE_DEBOUNCE_MS = 400;
const FRAME_POLL_MS = 2000;
const USAGE_POLL_MS = 20000;
const OVERLAY_PADDING = 58;
const USAGE_PANEL_WIDTH = 164;
const RING_BELOW_TEXT_HEIGHT = 36;
const APP_ICON_PATH = path.join(__dirname, "..", "assets", "spellbook-icon.png");

class LimitRingsWindowsApp {
  constructor() {
    this.codexHome = getDefaultCodexHome();
    this.statePath = path.join(this.codexHome, ".codex-global-state.json");
    this.authPath = path.join(this.codexHome, "auth.json");
    this.logsPath = defaultLogsPath(this.codexHome);
    this.claudeHome = claudeUsage.getDefaultClaudeHome();
    this.claudeAuthPath = path.join(this.claudeHome, ".credentials.json");
    this.claudeStatePath = claudeUsage.defaultStatePath(this.claudeHome);
    this.settingsStore = new RingSettingsStore(path.join(app.getPath("userData"), "settings.json"));
    this.overlay = null;
    this.colorPicker = null;
    this.tray = null;
    this.stateWatcher = null;
    this.framePoll = null;
    this.usagePoll = null;
    this.pendingFrameUpdate = null;
    this.ringsVisible = true;
    this.usage = emptyLimitState();
    this.claudeWatcher = null;
    this.pendingClaudeUpdate = null;
    this.claudeVisible = true;
    this.claude = claudeUsage.emptyClaudeState();
    this.lastBounds = null;
    this.currentAvatarID = null;
  }

  async run() {
    await this.createOverlay();
    this.createTray();
    this.installColorPickerHandlers();
    this.updateFrame();
    await this.updateUsage();
    await this.updateClaude();
    this.installStateWatcher();
    this.installClaudeWatcher();
    this.framePoll = setInterval(() => this.updateFrame(), FRAME_POLL_MS);
    this.usagePoll = setInterval(() => {
      this.updateUsage();
      this.updateClaude();
    }, USAGE_POLL_MS);
  }

  async createOverlay() {
    this.overlay = new BrowserWindow({
      width: 220,
      height: 220,
      icon: APP_ICON_PATH,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.overlay.setIgnoreMouseEvents(true, { forward: true });
    this.overlay.setAlwaysOnTop(true, "floating");
    this.overlay.on("close", (event) => {
      if (!isQuitting) {
        event.preventDefault();
        this.overlay.hide();
      }
    });
    await this.overlay.loadFile(path.join(__dirname, "overlay.html"));
  }

  createTray() {
    this.tray = new Tray(createTrayIcon());
    this.tray.setToolTip("Codex Pet Limit Rings");
    this.updateTrayMenu();
  }

  updateTrayMenu() {
    const source = this.usage.source === "live" ? "Live" : this.usage.source === "log" ? "Cached" : "Waiting";
    const primary = this.usage.primary ? `${Math.round(this.usage.primary.remainingPercent)}% short` : "short --";
    const secondary = this.usage.secondary ? `${Math.round(this.usage.secondary.remainingPercent)}% weekly` : "weekly --";
    const claudeLimits = this.claude.limits || {};
    const claudeSource = claudeLimits.source === "live" ? "Live" : claudeLimits.source === "statusline" ? "Statusline" : "Waiting";
    const claudePrimary = claudeLimits.primary ? `${Math.round(claudeLimits.primary.remainingPercent)}% 5h` : "5h --";
    const claudeSecondary = claudeLimits.secondary ? `${Math.round(claudeLimits.secondary.remainingPercent)}% weekly` : "weekly --";
    const settings = this.currentSettings();
    const menu = Menu.buildFromTemplate([
      { label: `Codex ${source}: ${primary}, ${secondary}`, enabled: false },
      { label: `Claude ${claudeSource}: ${claudePrimary}, ${claudeSecondary}`, enabled: false },
      { type: "separator" },
      {
        label: "Show Rings",
        type: "checkbox",
        checked: this.ringsVisible,
        click: (item) => {
          this.ringsVisible = item.checked;
          this.updateFrame();
        }
      },
      {
        label: "Show Claude",
        type: "checkbox",
        checked: this.claudeVisible,
        click: (item) => {
          this.claudeVisible = item.checked;
          this.sendSnapshot(Boolean(this.overlay && this.overlay.isVisible()));
        }
      },
      {
        label: "Ring Colors",
        submenu: [
          {
            label: "Codex (Outer Ring)",
            submenu: this.colorMenuTemplate("outer", settings)
          },
          {
            label: "Claude (Inner Ring)",
            submenu: this.colorMenuTemplate("inner", settings)
          },
          { type: "separator" },
          {
            label: "Reset This Pet",
            click: () => {
              this.settingsStore.resetAvatar(this.currentAvatarID);
              this.updateTrayMenu();
              this.sendSnapshot(Boolean(this.overlay && this.overlay.isVisible()));
            }
          }
        ]
      },
      {
        label: "Ring Opacity",
        submenu: [
          {
            label: "Codex (Outer Ring)",
            submenu: this.opacityMenuTemplate("outer", settings)
          },
          {
            label: "Claude (Inner Ring)",
            submenu: this.opacityMenuTemplate("inner", settings)
          }
        ]
      },
      {
        label: "Refresh Now",
        click: () => {
          this.updateUsage();
          this.updateClaude();
          this.updateFrame();
        }
      },
      { type: "separator" },
      {
        label: "Quit Codex Pet Limit Rings",
        click: () => app.quit()
      }
    ]);
    this.tray.setContextMenu(menu);
  }

  colorMenuTemplate(ring, settings) {
    const active = settings.colors[ring];
    return [
      ...RING_COLOR_PRESETS.map((preset) => ({
        label: preset.title,
        type: "radio",
        checked: !active.custom && active.preset === preset.id,
        click: () => {
          this.settingsStore.setColorPreset(this.currentAvatarID, ring, preset.id);
          this.updateTrayMenu();
          this.sendSnapshot(Boolean(this.overlay && this.overlay.isVisible()));
        }
      })),
      { type: "separator" },
      {
        label: "Custom...",
        type: "radio",
        checked: Boolean(active.custom),
        click: () => this.openColorPicker(ring)
      }
    ];
  }

  opacityMenuTemplate(ring, settings) {
    return RING_OPACITY_PRESETS.map((preset) => ({
      label: preset.title,
      type: "radio",
      checked: settings.opacity[ring] === preset.id,
      click: () => {
        this.settingsStore.setOpacityPreset(this.currentAvatarID, ring, preset.id);
        this.updateTrayMenu();
        this.sendSnapshot(Boolean(this.overlay && this.overlay.isVisible()));
      }
    }));
  }

  currentSettings() {
    return this.settingsStore.getForAvatar(this.currentAvatarID);
  }

  installStateWatcher() {
    if (this.stateWatcher) {
      this.stateWatcher.close();
      this.stateWatcher = null;
    }

    const directory = path.dirname(this.statePath);
    try {
      this.stateWatcher = fs.watch(directory, (eventType, fileName) => {
        if (!fileName || path.basename(fileName.toString()) === path.basename(this.statePath)) {
          this.scheduleFrameUpdate();
        }
      });
      this.stateWatcher.on("error", () => {
        this.stateWatcher = null;
      });
    } catch {
      this.stateWatcher = null;
    }
  }

  scheduleFrameUpdate() {
    clearTimeout(this.pendingFrameUpdate);
    this.pendingFrameUpdate = setTimeout(() => {
      this.pendingFrameUpdate = null;
      this.updateFrame();
    }, STATE_DEBOUNCE_MS);
  }

  installClaudeWatcher() {
    if (this.claudeWatcher) {
      this.claudeWatcher.close();
      this.claudeWatcher = null;
    }

    try {
      this.claudeWatcher = fs.watch(path.dirname(this.claudeStatePath), (eventType, fileName) => {
        if (fileName && path.basename(fileName.toString()) === path.basename(this.claudeStatePath)) {
          this.scheduleClaudeUpdate();
        }
      });
      this.claudeWatcher.on("error", () => {
        this.claudeWatcher = null;
      });
    } catch {
      this.claudeWatcher = null;
    }
  }

  scheduleClaudeUpdate() {
    clearTimeout(this.pendingClaudeUpdate);
    this.pendingClaudeUpdate = setTimeout(() => {
      this.pendingClaudeUpdate = null;
      this.updateClaude();
    }, CLAUDE_STATE_DEBOUNCE_MS);
  }

  async updateClaude() {
    this.claude = await claudeUsage.readLatestUsage({
      claudeHome: this.claudeHome,
      authPath: this.claudeAuthPath,
      statePath: this.claudeStatePath
    });
    this.updateTrayMenu();
    this.sendSnapshot(Boolean(this.overlay && this.overlay.isVisible()));
  }

  updateFrame() {
    let codexState;
    try {
      codexState = readCodexState(this.statePath);
    } catch {
      this.hideOverlay();
      return;
    }

    this.currentAvatarID = codexState.avatarId || null;
    this.updateTrayMenu();

    if (!this.ringsVisible || !codexState.open || !codexState.petFrame) {
      this.hideOverlay();
      return;
    }

    const bounds = panelBoundsForPet(codexState.petFrame);
    this.lastBounds = bounds;
    this.overlay.setBounds(bounds, false);
    this.overlay.showInactive();
    this.sendSnapshot(true);
  }

  hideOverlay() {
    if (this.overlay && this.overlay.isVisible()) {
      this.overlay.hide();
    }
    this.sendSnapshot(false);
  }

  async updateUsage() {
    this.usage = await readLatestUsage({
      codexHome: this.codexHome,
      authPath: this.authPath,
      logsPath: this.logsPath
    });
    this.updateTrayMenu();
    this.sendSnapshot(Boolean(this.overlay && this.overlay.isVisible()));
  }

  sendSnapshot(visible) {
    if (!this.overlay || this.overlay.webContents.isDestroyed()) {
      return;
    }
    this.overlay.webContents.send("limit-rings:snapshot", {
      visible,
      usage: this.usage,
      claude: this.claudeVisible ? this.claude : null,
      style: resolvedRingStyle(this.currentSettings())
    });
  }

  openColorPicker(ring) {
    if (this.colorPicker && !this.colorPicker.isDestroyed()) {
      this.colorPicker.close();
    }
    const style = resolvedRingStyle(this.currentSettings());
    const initialColor = ring === "inner" ? style.innerColor : style.outerColor;
    this.colorPicker = new BrowserWindow({
      width: 320,
      height: 190,
      icon: APP_ICON_PATH,
      resizable: false,
      minimizable: false,
      maximizable: false,
      parent: this.overlay,
      modal: false,
      title: ring === "inner" ? "Choose Claude (Inner Ring) Color" : "Choose Codex (Outer Ring) Color",
      webPreferences: {
        preload: path.join(__dirname, "colorPickerPreload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    const query = new URLSearchParams({ ring, color: initialColor });
    this.colorPicker.loadFile(path.join(__dirname, "colorPicker.html"), { query: Object.fromEntries(query) });
    this.colorPicker.on("closed", () => {
      this.colorPicker = null;
    });
  }

  installColorPickerHandlers() {
    ipcMain.on("limit-rings:custom-color", (event, payload) => {
      if (!this.isColorPickerSender(event.sender)) {
        return;
      }
      if (!payload || !["outer", "inner"].includes(payload.ring)) {
        return;
      }
      this.settingsStore.setCustomColor(this.currentAvatarID, payload.ring, payload.color);
      if (this.colorPicker && !this.colorPicker.isDestroyed()) {
        this.colorPicker.close();
      }
      this.updateTrayMenu();
      this.sendSnapshot(Boolean(this.overlay && this.overlay.isVisible()));
    });
    ipcMain.on("limit-rings:close-color-picker", (event) => {
      if (!this.isColorPickerSender(event.sender)) {
        return;
      }
      if (this.colorPicker && !this.colorPicker.isDestroyed()) {
        this.colorPicker.close();
      }
    });
  }

  isColorPickerSender(sender) {
    return Boolean(this.colorPicker && !this.colorPicker.isDestroyed() && sender === this.colorPicker.webContents);
  }

  dispose() {
    clearInterval(this.framePoll);
    clearInterval(this.usagePoll);
    clearTimeout(this.pendingFrameUpdate);
    clearTimeout(this.pendingClaudeUpdate);
    if (this.stateWatcher) {
      this.stateWatcher.close();
    }
    if (this.claudeWatcher) {
      this.claudeWatcher.close();
    }
    if (this.colorPicker && !this.colorPicker.isDestroyed()) {
      this.colorPicker.close();
    }
  }
}

function panelBoundsForPet(petFrame) {
  const size = Math.ceil(Math.max(petFrame.width, petFrame.height) + OVERLAY_PADDING * 2);
  return {
    x: Math.round(petFrame.x + petFrame.width / 2 - size / 2 - USAGE_PANEL_WIDTH),
    y: Math.round(petFrame.y + petFrame.height / 2 - size / 2),
    width: size + USAGE_PANEL_WIDTH,
    height: size + RING_BELOW_TEXT_HEIGHT
  };
}

function createTrayIcon() {
  if (fs.existsSync(APP_ICON_PATH)) {
    const icon = nativeImage.createFromPath(APP_ICON_PATH);
    if (!icon.isEmpty()) {
      return icon.resize({ width: 32, height: 32 });
    }
  }

  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#0b1220"/>
      <circle cx="16" cy="16" r="10" fill="none" stroke="#4cebc2" stroke-width="4" stroke-linecap="round" stroke-dasharray="48 16" transform="rotate(-90 16 16)"/>
      <circle cx="16" cy="16" r="5" fill="none" stroke="#60b2ff" stroke-width="3" stroke-linecap="round" stroke-dasharray="22 10" transform="rotate(-90 16 16)"/>
    </svg>
  `);
  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${svg}`);
}

let ringsApp;
let isQuitting = false;

async function runSmokeCheck() {
  const codexHome = getDefaultCodexHome();
  const statePath = path.join(codexHome, ".codex-global-state.json");
  let stateReadable = false;
  let petOpen = false;
  let hasPetFrame = false;
  try {
    const state = readCodexState(statePath);
    stateReadable = true;
    petOpen = state.open;
    hasPetFrame = Boolean(state.petFrame);
  } catch {
    stateReadable = false;
  }
  const claudeHome = claudeUsage.getDefaultClaudeHome();
  const claude = await claudeUsage.readLatestUsage({ claudeHome });
  console.log(
    JSON.stringify({
      codexHome,
      stateReadable,
      petOpen,
      hasPetFrame,
      authExists: fs.existsSync(path.join(codexHome, "auth.json")),
      logsExists: fs.existsSync(defaultLogsPath(codexHome)),
      claudeHome,
      claudeAuthExists: fs.existsSync(path.join(claudeHome, ".credentials.json")),
      claudeStateExists: fs.existsSync(claudeUsage.defaultStatePath(claudeHome)),
      claudeLimitsSource: claude.limits.source,
      claudeFiveHourRemaining: claude.limits.primary ? claude.limits.primary.remainingPercent : null,
      claudeWeeklyRemaining: claude.limits.secondary ? claude.limits.secondary.remainingPercent : null,
      claudeSessionModel: claude.session ? claude.session.model : null
    })
  );
  app.quit();
}

if (process.argv.includes("--smoke")) {
  app.whenReady().then(runSmokeCheck);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (ringsApp) {
      ringsApp.updateFrame();
      ringsApp.updateTrayMenu();
    }
  });

  app.whenReady().then(async () => {
    ringsApp = new LimitRingsWindowsApp();
    await ringsApp.run();
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  if (ringsApp) {
    ringsApp.dispose();
  }
});

app.on("window-all-closed", () => {
  // Keep the tray app alive unless the user explicitly quits from the tray menu.
});

module.exports = {
  LimitRingsWindowsApp,
  panelBoundsForPet
};
