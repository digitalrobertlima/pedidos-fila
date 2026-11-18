@echo off
chcp 65001 >nul
cd /d "%~dp0"
python resumo.py
echo.
echo Se deu certo, envie o arquivo para_enviar.zip (nesta pasta) no chat.
pause
