@echo off
REM Rabies Track Nepal - one-command local runner (Windows cmd).
REM   run-local.bat                 install -> env -> migrate -> seed -> API :5000 + web :3000
REM   run-local.bat --keep-data     keep existing data (skip reseed if users exist)
REM   run-local.bat --no-dev        prepare everything but don't start the server
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node 20.12+ ^(22 LTS recommended^) from https://nodejs.org
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not available on PATH ^(it ships with Node.js^).
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo node %%v

node scripts\setup.mjs %*
exit /b %errorlevel%
