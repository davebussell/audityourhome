@echo off
cd /d "%~dp0"
echo Publishing your changes to audityourhome.com ...
git add -A
git commit -m "Site update %date% %time%"
git push -u origin main
echo.
echo Done! The site rebuilds automatically - changes are live in ~2 minutes.
pause
