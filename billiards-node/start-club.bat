@echo off
cd /d "%~dp0"

rem Первый запуск: ставим зависимости, если их ещё нет
if not exist node_modules (
  echo Первый запуск: установка зависимостей, подождите...
  call npm install
)

rem Если сервер уже работает - просто открываем страницу
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient('127.0.0.1',8000)).Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  start "" http://127.0.0.1:8000
  exit /b
)

rem Запускаем сервер в свёрнутом окне и открываем браузер
start "Сервер клуба" /min cmd /c "npm start"
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:8000
