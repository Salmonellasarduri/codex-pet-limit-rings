param(
  [switch]$Detached,
  [switch]$SkipInstall,
  [switch]$Check
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$WindowsDir = Join-Path $RootDir "windows"
$PackageJson = Join-Path $WindowsDir "package.json"
$ElectronBin = Join-Path $WindowsDir "node_modules\.bin\electron.cmd"

if (-not (Test-Path -LiteralPath $PackageJson)) {
  throw "Cannot find Windows app package.json at $PackageJson"
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "Node.js is required. Install Node.js, then rerun this script."
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npm) {
  throw "npm is required. Install Node.js with npm, then rerun this script."
}

if (-not $SkipInstall -and -not (Test-Path -LiteralPath $ElectronBin)) {
  Write-Host "Installing Windows ring UI dependencies..."
  Push-Location $WindowsDir
  try {
    & $npm.Source install
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

if ($Check) {
  Write-Host "Codex Pet Limit Rings Windows launcher is ready."
  Write-Host "Windows app: $WindowsDir"
  exit 0
}

if ($Detached) {
  $process = Start-Process -FilePath $npm.Source -ArgumentList "start" -WorkingDirectory $WindowsDir -WindowStyle Hidden -PassThru
  Write-Host "Codex Pet Limit Rings started in the background. PID: $($process.Id)"
  Write-Host "Open a Codex pet; the rings will appear when Codex writes the pet bounds."
  exit 0
}

Write-Host "Starting Codex Pet Limit Rings. Open a Codex pet to show the rings."
Push-Location $WindowsDir
try {
  & $npm.Source start
  if ($LASTEXITCODE -ne 0) {
    throw "npm start failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}
