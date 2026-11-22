@echo off
chcp 65001 >nul
title BOSS AI 助手
cd /d "%~dp0"
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo 缺少运行依赖，请在 desktop 目录执行 npm install 后重试。
  pause
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE="
start "" "%~dp0node_modules\electron\dist\electron.exe" .
