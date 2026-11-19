@echo off
chcp 65001 >nul
REM Modo com janela (para testar e ver mensagens). O filtro de janela vem do arquivo janela.txt.
cd /d "%~dp0"
python gravador.py
pause
