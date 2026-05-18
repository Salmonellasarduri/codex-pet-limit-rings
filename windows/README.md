# Codex Pet Limit Rings for Windows

This is a Windows companion app for Codex pets. It keeps the same boundary as the macOS app: it does not patch Codex, replace pet art, or modify the Codex app bundle.

The app reads local Codex state from `%USERPROFILE%\.codex`, follows the current Codex pet with a transparent click-through overlay, and draws usage-limit rings around it.

## Run

From the repository root, use the simple launcher:

```powershell
.\tools\start-limit-rings.ps1
```

Use a background launch when you want to keep working in the terminal:

```powershell
.\tools\start-limit-rings.ps1 -Detached
```

To make the companion start whenever Windows signs in:

```powershell
.\tools\install-limit-rings-windows.ps1
```

The installer checks dependencies first, then creates a Startup folder shortcut that runs `npm start` in this `windows/` app directory. It does not patch Codex and does not run dependency installation silently at sign-in. Remove the shortcut with:

```powershell
.\tools\uninstall-limit-rings-windows.ps1
```

The companion can be started before the pet is visible. It watches `%USERPROFILE%\.codex\.codex-global-state.json`, hides the overlay while the Codex pet is closed, and shows the rings again when Codex opens the pet and writes mascot bounds.

For development, run Electron directly:

```powershell
cd windows
npm install
npm start
```

Use the tray icon to toggle rings, refresh usage data, or quit.

The tray menu also includes:

- `Ring Colors` for separate outer and inner ring presets or custom colors.
- `Ring Opacity` for separate outer and inner opacity presets.
- `Reset This Pet` to clear saved color and opacity settings for the current Codex pet.

## Test

```powershell
npm test
```

## Data

The app reads:

- `%USERPROFILE%\.codex\.codex-global-state.json` for pet open state and `electron-avatar-overlay-bounds.mascot`.
- `%USERPROFILE%\.codex\auth.json` for the local ChatGPT access token used with `https://chatgpt.com/backend-api/wham/usage`.
- `%USERPROFILE%\.codex\logs_2.sqlite` or `logs_1.sqlite` as a cached fallback source for the newest `codex.rate_limits` event.

The access token is only sent to ChatGPT's usage endpoint and is never logged.

## Current Scope

This Windows version is an MVP:

- Outer ring: short-window remaining percentage.
- Inner ring: weekly remaining percentage.
- Tray actions: show/hide, refresh, quit.
- Single-instance startup so repeated launches do not create duplicate overlays.
- Transparent always-on-top overlay with click-through mouse behavior.
- Live usage first, local cached fallback second.
- Optional launch-at-login through `tools\install-limit-rings-windows.ps1`.
