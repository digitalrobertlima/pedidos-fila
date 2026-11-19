@echo off
chcp 65001 >nul
echo Depois de apertar uma tecla, clique no PDV e deixe-o na frente por 40 segundos.
pause
python gravador.py --descobrir
echo.
echo Abra o arquivo janela.txt e troque "Degust" pelo trecho que apareceu acima (se for diferente).
pause
