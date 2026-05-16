# Codex Pet Limit Rings for Windows

This is a Windows companion app for Codex pets. It keeps the same boundary as the macOS app: it does not patch Codex, replace pet art, or modify the Codex app bundle.

The app reads local Codex state from `%USERPROFILE%\.codex`, follows the current Codex pet with a transparent click-through overlay, and draws usage-limit rings around it.

## Run

```powershell
cd windows
npm install
npm start
```

Use the tray icon to toggle rings, refresh usage data, or quit.

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
- Transparent always-on-top overlay with click-through mouse behavior.
- Live usage first, local cached fallback second.

Color customization and launch-at-login packaging are intentionally left for a later pass.
