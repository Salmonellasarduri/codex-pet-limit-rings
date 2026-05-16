const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, Menu, Tray, nativeImage } = require("electron");
const { getDefaultCodexHome, readCodexState } = require("./codexState");
const { defaultLogsPath, emptyLimitState, readLatestUsage } = require("./usage");

const STATE_DEBOUNCE_MS = 35;
const FRAME_POLL_MS = 2000;
const USAGE_POLL_MS = 20000;
const OVERLAY_PADDING = 38;

class LimitRingsWindowsApp {
  constructor() {
    this.codexHome = getDefaultCodexHome();
    this.statePath = path.join(this.codexHome, ".codex-global-state.json");
    this.authPath = path.join(this.codexHome, "auth.json");
    this.logsPath = defaultLogsPath(this.codexHome);
    this.overlay = null;
    this.tray = null;
    this.stateWatcher = null;
    this.framePoll = null;
    this.usagePoll = null;
    this.pendingFrameUpdate = null;
    this.ringsVisible = true;
    this.usage = emptyLimitState();
    this.lastBounds = null;
  }

  async run() {
    await this.createOverlay();
    this.createTray();
    this.updateFrame();
    await this.updateUsage();
    this.installStateWatcher();
    this.framePoll = setInterval(() => this.updateFrame(), FRAME_POLL_MS);
    this.usagePoll = setInterval(() => this.updateUsage(), USAGE_POLL_MS);
  }

  async createOverlay() {
    this.overlay = new BrowserWindow({
      width: 220,
      height: 220,
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
    this.overlay.setAlwaysOnTop(true, "screen-saver");
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
    const menu = Menu.buildFromTemplate([
      { label: `${source}: ${primary}, ${secondary}`, enabled: false },
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
        label: "Refresh Now",
        click: () => {
          this.updateUsage();
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

  updateFrame() {
    let codexState;
    try {
      codexState = readCodexState(this.statePath);
    } catch {
      this.hideOverlay();
      return;
    }

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
      usage: this.usage
    });
  }

  dispose() {
    clearInterval(this.framePoll);
    clearInterval(this.usagePoll);
    clearTimeout(this.pendingFrameUpdate);
    if (this.stateWatcher) {
      this.stateWatcher.close();
    }
  }
}

function panelBoundsForPet(petFrame) {
  const size = Math.ceil(Math.max(petFrame.width, petFrame.height) + OVERLAY_PADDING * 2);
  return {
    x: Math.round(petFrame.x + petFrame.width / 2 - size / 2),
    y: Math.round(petFrame.y + petFrame.height / 2 - size / 2),
    width: size,
    height: size
  };
}

function createTrayIcon() {
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

app.whenReady().then(async () => {
  if (process.argv.includes("--smoke")) {
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
    console.log(
      JSON.stringify({
        codexHome,
        stateReadable,
        petOpen,
        hasPetFrame,
        authExists: fs.existsSync(path.join(codexHome, "auth.json")),
        logsExists: fs.existsSync(defaultLogsPath(codexHome))
      })
    );
    app.quit();
    return;
  }

  ringsApp = new LimitRingsWindowsApp();
  await ringsApp.run();
});

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
