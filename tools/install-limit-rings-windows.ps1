Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$WindowsDir = Join-Path $RootDir "windows"
$StartScript = Join-Path $PSScriptRoot "start-limit-rings.ps1"
$StartupDir = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupDir "Codex Pet Limit Rings.lnk"

if (-not (Test-Path -LiteralPath $StartScript)) {
  throw "Cannot find start script at $StartScript"
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npm) {
  throw "npm is required. Install Node.js with npm, then rerun this script."
}

& $StartScript -Check

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = $npm.Source
$shortcut.Arguments = "start"
$shortcut.WorkingDirectory = $WindowsDir
$shortcut.Description = "Start Codex Pet Limit Rings when Windows signs in"
$shortcut.WindowStyle = 7
$shortcut.Save()

Write-Host "Installed startup shortcut: $ShortcutPath"
Write-Host "Starting Codex Pet Limit Rings now..."
& $StartScript -Detached
