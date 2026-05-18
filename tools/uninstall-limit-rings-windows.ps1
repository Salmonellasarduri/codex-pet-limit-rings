Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$StartupDir = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupDir "Codex Pet Limit Rings.lnk"

if (Test-Path -LiteralPath $ShortcutPath) {
  Remove-Item -LiteralPath $ShortcutPath
  Write-Host "Removed startup shortcut: $ShortcutPath"
} else {
  Write-Host "Startup shortcut was not installed."
}

Write-Host "Quit the running app from the Codex Pet Limit Rings tray menu if it is open."
