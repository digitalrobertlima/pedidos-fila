@echo off
chcp 65001 >nul
echo Instalando as bibliotecas do gravador...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
echo.
echo Pronto. Agora rode "descobrir_janela.bat".
pause
