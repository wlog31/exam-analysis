@echo off
setlocal

cd /d "%~dp0"

echo [1/3] Checking dependencies...
if not exist "node_modules" (
  call npm install
  if errorlevel 1 goto :error
)

echo [2/3] Building app...
call npm run build
if errorlevel 1 goto :error

echo [3/3] Starting app...
call npm run desktop:start
if errorlevel 1 goto :error

goto :end

:error
echo.
echo ERROR: See messages above.
pause
exit /b 1

:end
endlocal
