# Gravador do PDV (fase 1 do robô de lançamento)

Programa que **só observa** o PDV por alguns dias: anota cada clique (posição, hora, tela antes e depois) e guarda uma foto de cada **tela diferente**. Ele **não clica, não digita e não envia nada pela internet**. No fim, gera um pacote pequeno para o Claude montar o mapa de cliques do robô.

## O que fica gravado
- Cliques do mouse: hora, posição, botão, id da tela antes e depois.
- Teclas **especiais** (F1…F12, Enter, Esc, Tab…). F-keys, Enter e Esc também guardam a tela que abriu em seguida.
- **Códigos curtos digitados** (até 4 números), como o **12** da promoção de 10 pastéis, junto com a tela que abriu depois. Não precisa apertar Enter: o gravador entende que o código acabou quando você para de digitar.
- Números **longos** (CPF, cartão…) **não** são gravados: só fica registrado que houve um número de X dígitos.
- Letras não são gravadas, só "caractere".
- Uma foto (JPEG) de cada tela diferente do PDV, não uma foto por clique.

## Avisos importantes
- **Avise as funcionárias** que a tela do caixa está sendo gravada para esse fim.
- As fotos podem mostrar o nome da operadora, e um CPF se ele aparecer na tela. **Ctrl+Alt+P pausa** a gravação nessa hora. Antes de enviar o pacote, confira a pasta `resumo\telas`.
- A pasta `gravacao` fica só no computador do caixa e **não vai para o GitHub** (o `.gitignore` bloqueia).
- Não rode isso fora do PC do caixa que você administra.

## Passo a passo (Windows 10)
1. Instale o **Python 3.12** em python.org. Na primeira tela, **marque "Add python.exe to PATH"**.
2. Copie esta pasta `agente` para o computador do caixa.
3. Dê dois cliques em **`instalar.bat`**.
4. Dê dois cliques em **`descobrir_janela.bat`**. Aperte uma tecla, clique no PDV e deixe ele na frente. Vai aparecer o título da janela. Abra o arquivo **`janela.txt`** e troque `Degust` por uma parte desse título, se for diferente.
5. Dê dois cliques em **`instalar_inicio_automatico.bat`**. Daí em diante o gravador **abre sozinho quando o Windows liga, sem nenhuma janela, e termina quando o PC desliga**. Cada evento é salvo na hora, então desligar o PC a qualquer momento não perde nada.
6. Para começar hoje sem reiniciar: **`iniciar_agora_sem_janela.bat`**.
7. Deixe de **3 a 7 dias** com o movimento normal. O PDV pode ficar em tela cheia o tempo todo: o gravador roda por baixo e não atrapalha.
8. **Uma vez**, com calma e com uma operadora, faça os casos raros, sem finalizar venda (cancele em seguida): um combo de cada tipo, refrescos 300 e 500, caldo, suco, café com leite, lanche, bebidas com sabor, desconto, remover item e voltar.
9. Quando quiser o pacote, aperte **Ctrl+Alt+Q** (encerra o gravador) e dê dois cliques em **`gerar_resumo.bat`**.
10. Envie o arquivo **`para_enviar.zip`** no chat com o Claude.

Para desligar o início automático: `remover_inicio_automatico.bat`.

Se algo não gravar, olhe `gravacao\erro.log`.

## Atalhos
| Atalho | Faz |
|---|---|
| Ctrl+Alt+P | pausa / retoma a gravação |
| Ctrl+Alt+Q | encerra o gravador |

## Por que só funciona bem com o movimento real
O gravador só vê o que acontece. Opções que ninguém vende nesses dias não aparecem, por isso o passo 8.
