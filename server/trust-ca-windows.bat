@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "rootCA.crt" (
  echo Сначала выполните: npm run cert
  pause
  exit /b 1
)

echo Добавление KastryulaMarket Dev CA в доверенные корневые центры...
certutil -addstore -f "Root" "%~dp0rootCA.crt"

if %ERRORLEVEL% equ 0 (
  echo.
  echo Готово. Закройте Chrome полностью и откройте https://localhost:3001
) else (
  echo.
  echo Ошибка. Запустите этот файл ПКМ - "Запуск от имени администратора"
)

pause
