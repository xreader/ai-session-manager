@echo off
cd /d "%~dp0"
echo Starting Claude Session Manager...
start "" http://localhost:4317
node server.js
