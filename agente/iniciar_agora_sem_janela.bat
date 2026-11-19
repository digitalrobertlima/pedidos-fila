@echo off
cd /d "%~dp0"
start "" pythonw "%~dp0gravador.py"
echo Gravador iniciado em segundo plano. Ctrl+Alt+Q encerra, Ctrl+Alt+P pausa.
timeout /t 4 >nul
