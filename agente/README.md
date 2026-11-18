# Gravador do PDV (fase 1 do robô de lançamento)

Programa que **só observa** o PDV por alguns dias: anota cada clique (posição, hora, tela antes e depois) e guarda uma foto de cada **tela diferente**. Ele **não clica, não digita e não envia nada pela internet**. No fim, gera um pacote pequeno para o Claude montar o mapa de cliques do robô.

## O que fica gravado
- Cliques do mouse: hora, posição, botão, id da tela antes e depois.
- Teclas **especiais** (F1…F12, Enter, Esc, Tab…). Letras e números **não** são gravados, só "digito"/"caractere".
- Uma foto (JPEG) de cada tela diferente do PDV. Não é uma foto por clique.

## Avisos importantes
- **Avise as funcionárias** que a tela do caixa está sendo gravada para esse fim.
- As fotos podem mostrar o nome da operadora, e um CPF se ele aparecer na tela. **Ctrl+Alt+P pausa** a gravação nessa hora. Antes de enviar o pacote, confira a pasta `resumo\telas`.
- A pasta `gravacao` fica só no computador do caixa e **não vai para o GitHub** (o `.gitignore` bloqueia).
- Não rode isso fora do PC do caixa que você administra.

## Passo a passo (Windows 10)
1. Instale o **Python 3.12** em python.org. Na primeira tela, **marque "Add python.exe to PATH"**.
2. Copie esta pasta `agente` para o computador do caixa.
3. Dê dois cliques em **`instalar.bat`**.
4. Dê dois cliques em **`descobrir_janela.bat`**. Aperte uma tecla, clique no PDV e deixe ele na frente. Vai aparecer o título da janela. Anote uma parte dele.
5. Abra `iniciar_gravador.bat` no Bloco de Notas e troque `Degust` pelo trecho que apareceu. Depois dê dois cliques nele. Deixe a janela preta aberta (pode minimizar).
   - Para iniciar sozinho com o Windows: aperte `Win+R`, digite `shell:startup` e coloque aqui um atalho para `iniciar_gravador.bat`.
6. Deixe gravando de **3 a 7 dias** com o movimento normal.
7. **Uma vez**, com calma e com uma operadora, faça os casos raros, sem finalizar venda (cancele em seguida): um combo de cada tipo, refrescos 300 e 500, caldo, suco, café com leite, lanche, bebidas com sabor, desconto, remover item e voltar.
8. Quando terminar, aperte **Ctrl+Alt+Q**. Depois dê dois cliques em **`gerar_resumo.bat`**.
9. Envie o arquivo **`para_enviar.zip`** no chat com o Claude.

## Atalhos
| Atalho | Faz |
|---|---|
| Ctrl+Alt+P | pausa / retoma a gravação |
| Ctrl+Alt+Q | encerra o gravador |

## Por que só funciona bem com o movimento real
O gravador só vê o que acontece. Opções que ninguém vende nesses dias não aparecem, por isso o passo 7.
