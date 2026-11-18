@echo off
chcp 65001 >nul
echo Depois de apertar uma tecla, clique no PDV e deixe-o na frente por 40 segundos.
pause
python gravador.py --descobrir
pause
