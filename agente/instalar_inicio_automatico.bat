@echo off
chcp 65001 >nul
REM Faz o gravador abrir sozinho (sem janela) quando o Windows iniciar.
REM Ele termina junto com o PC; cada evento já é salvo na hora, então nada se perde.
cd /d "%~dp0"
where pythonw >nul 2>nul
if errorlevel 1 (
  echo Python nao encontrado. Instale o Python marcando "Add python.exe to PATH".
  pause
  exit /b 1
)
set "DESTINO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\GravadorPDV.vbs"
(
echo Set sh = CreateObject("WScript.Shell"^)
echo sh.CurrentDirectory = "%~dp0"
echo sh.Run "pythonw ""%~dp0gravador.py""", 0, False
) > "%DESTINO%"
echo Pronto! O gravador vai abrir sozinho na proxima vez que o Windows iniciar.
echo Para iniciar agora sem reiniciar, de dois cliques em "iniciar_agora_sem_janela.bat".
pause
