@echo off
chcp 65001 >nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\GravadorPDV.vbs" 2>nul
echo Inicio automatico removido. Para parar o gravador que esta rodando agora, aperte Ctrl+Alt+Q.
pause
