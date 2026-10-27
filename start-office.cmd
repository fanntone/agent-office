@echo off
rem Double-click: starts the AI office in the background (if it is not running yet) and opens it in the browser.
node "%~dp0tools\office.js" start
if errorlevel 1 pause
