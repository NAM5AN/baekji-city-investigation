@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 goto folder_error
title Baekji City v0.3.18

where node >nul 2>nul
if errorlevel 1 goto node_missing

echo.
echo Baekji City v0.3.18
echo http://localhost:4173
echo Node version:
node --version
echo.
node server.mjs
set "BAEKJI_EXIT_CODE=%ERRORLEVEL%"
echo.
echo [NOTICE] The server stopped. Exit code: %BAEKJI_EXIT_CODE%
echo Keep this window open while using the website.
goto hold

:node_missing
set "BAEKJI_EXIT_CODE=1"
echo.
echo [ERROR] Node.js was not found.
echo Install Node.js 18 or newer, then run this file again:
echo https://nodejs.org/
goto hold

:folder_error
set "BAEKJI_EXIT_CODE=1"
echo.
echo [ERROR] Could not open the extracted project folder.
echo Extract the entire ZIP first, then run run.bat inside that folder.

:hold
echo.
pause
exit /b %BAEKJI_EXIT_CODE%
