# Codex Pet Limit Rings for Windows

This is a Windows companion app for Codex pets. It keeps the same boundary as the macOS app: it does not patch Codex, replace pet art, or modify the Codex app bundle.

The app reads local Codex state from `%USERPROFILE%\.codex`, follows the current Codex pet with a transparent click-through overlay, and draws usage-limit rings around it.

It can also show Claude Code limits next to the same pet: the rings pair the weekly windows (outer ring Codex, inner ring Claude) with percent and reset time written below the ring, and a compact panel on the left pairs the 5h windows as bars with percent and reset time, plus the active Claude session's model and context usage.

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

- `Ring Colors` for separate Codex (outer ring) and Claude (inner ring) presets or custom colors.
- `Ring Opacity` for separate Codex (outer ring) and Claude (inner ring) opacity presets.
- `Reset This Pet` to clear saved color and opacity settings for the current Codex pet.
- `Show Claude` to toggle the Claude ring, text, and bar row.

## Claude Data

Claude limits come from two sources, live first, local fallback second (same policy as Codex):

- Live: `https://api.anthropic.com/api/oauth/usage` with the local OAuth token from `%USERPROFILE%\.claude\.credentials.json` (read-only; the app never refreshes or rewrites the token, and skips the call when the token is expired).
- Fallback: `%USERPROFILE%\.claude\pet-ring-state.json`, a small mirror file written by the Claude Code statusline command. This also supplies the session line (model name and context usage), which has no live endpoint.

To enable the statusline mirror, make your statusline command write the payload it receives on stdin to `pet-ring-state.json`. Example snippet for a Python statusline:

```python
def tee_pet_ring_state(payload):
    try:
        state = {
            'updatedAt': int(time.time() * 1000),
            'sessionId': payload.get('session_id'),
            'cwd': payload.get('cwd') or (payload.get('workspace') or {}).get('current_dir'),
            'model': (payload.get('model') or {}).get('display_name'),
            'context_window': payload.get('context_window'),
            'rate_limits': payload.get('rate_limits'),
        }
        target = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pet-ring-state.json')
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(target), suffix='.tmp')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False)
        os.replace(tmp, target)
    except Exception:
        pass
```

The overlay works without the mirror file too — it then relies on the live endpoint alone and omits the session line.

## Test

```powershell
npm test
```

## Data

The app reads:

- `%USERPROFILE%\.codex\.codex-global-state.json` for pet open state and `electron-avatar-overlay-bounds.mascot`.
- `%USERPROFILE%\.codex\auth.json` for the local ChatGPT access token used with `https://chatgpt.com/backend-api/wham/usage`.
- `%USERPROFILE%\.codex\logs_2.sqlite` or `logs_1.sqlite` as a cached fallback source for the newest `codex.rate_limits` event.
- `%USERPROFILE%\.claude\.credentials.json` for the local Claude OAuth token used with `https://api.anthropic.com/api/oauth/usage`.
- `%USERPROFILE%\.claude\pet-ring-state.json` as the statusline-mirror fallback and session-info source.

Each access token is only sent to its own vendor's usage endpoint and is never logged.

## Current Scope

This Windows version is an MVP:

- Outer ring: Codex weekly remaining percentage.
- Inner ring: Claude weekly remaining percentage.
- Below the ring: weekly percent and reset time for both vendors.
- Left panel: Codex and Claude 5h remaining bars with percent and reset time, plus the Claude model and context line.
- Tray actions: show/hide rings, show/hide Claude, refresh, quit.
- Single-instance startup so repeated launches do not create duplicate overlays.
- Transparent always-on-top overlay with click-through mouse behavior.
- Live usage first, local cached fallback second.
- Optional launch-at-login through `tools\install-limit-rings-windows.ps1`.
