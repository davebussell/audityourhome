@echo off
cd /d "%~dp0"
set "LOG=%~dp0_to_delete\push-log.txt"
echo Publishing your changes to audityourhome.com ...
echo ==== %date% %time% > "%LOG%"
git --version >> "%LOG%" 2>&1
git rm -r -q --cached --ignore-unmatch ayh-update-v2.zip ayh-v3.zip _to_delete >> "%LOG%" 2>&1
git add -A >> "%LOG%" 2>&1
git commit -m "Site update %date% %time%" >> "%LOG%" 2>&1
git push -u origin main >> "%LOG%" 2>&1
set "RC=%errorlevel%"
type "%LOG%"
echo.
if "%RC%"=="0" (echo Done! The site rebuilds automatically - changes are live in ~2 minutes.) else (echo Push failed. Claude can read the details in _to_delete\push-log.txt)
pause
