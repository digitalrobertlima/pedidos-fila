@echo off
chcp 65001 >nul
REM ===== EDITE AQUI: parte do título da janela do PDV (use descobrir_janela.bat) =====
set JANELA=Degust
REM ====================================================================================
cd /d "%~dp0"
python gravador.py --janela "%JANELA%"
pause
