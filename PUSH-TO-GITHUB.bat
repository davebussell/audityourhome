@echo off
cd /d "%~dp0"
echo Publishing your changes to audityourhome.com ...
git rm -r -q --cached --ignore-unmatch ayh-update-v2.zip ayh-v3.zip _to_delete 2>nul
git add -A
git commit -m "Site update %date% %time%"
git push -u origin main
echo.
echo Done! The site rebuilds automatically - changes are live in ~2 minutes.
pause
