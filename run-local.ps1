# Rabies Track Nepal - one-command local runner (Windows PowerShell 5.1+ / PowerShell 7).
#   .\run-local.ps1                 install -> env -> migrate -> seed -> API :5000 + web :3000
#   .\run-local.ps1 --keep-data     keep existing data (skip reseed if users exist)
#   .\run-local.ps1 --no-dev        prepare everything but don't start the server
# If scripts are blocked: powershell -ExecutionPolicy Bypass -File .\run-local.ps1
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js is not installed. Install Node 20.12+ (22 LTS recommended) from https://nodejs.org' -ForegroundColor Red
  exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host 'npm is not available on PATH (it ships with Node.js).' -ForegroundColor Red
  exit 1
}
Write-Host ("node {0} - npm {1}" -f (node -v), (npm -v))

node scripts/setup.mjs @args
exit $LASTEXITCODE
