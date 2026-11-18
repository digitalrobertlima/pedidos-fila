# pedidos-fila

Sistema de autoatendimento para fila e gestão de pedidos — **White-Label**, 100% estático (GitHub Pages), sem backend e sem banco de dados pago. A comunicação em tempo real usa o serviço gratuito [ntfy.sh](https://ntfy.sh).

| Página | Uso |
|---|---|
| `index.html` | App do cliente (celular): nome → cardápio → carrinho → pagamento → **comanda digital** |
| `caixa.html` | Tablet do caixa: **Fila de Pedidos** + **Gestão do Cardápio** (PIN) |

## Arquivos

```
config.js          ← ÚNICO arquivo a editar por loja (nome, cor, tópicos ntfy)
versao.js          ← número da versão: AUMENTE a cada mudança no site
cardapio-seed.js   ← cardápio inicial de fábrica
comum.js           ← funções compartilhadas (ntfy, PWA, atualização, regras do cardápio)
ilustracoes.js     ← produtos em "3D" (SVG vetorial, muda de cor conforme o sabor)
index.html / cliente.js / style.css
caixa.html / caixa.js
manifest.json        ← PWA do cliente (opcional instalar)
manifest-caixa.json  ← PWA do caixa (tela cheia, ícone escuro)
sw.js                ← service worker: abre offline e sempre busca a versão nova
icons/ · icon.svg · manter-acordado.mp4
```

## Apps instaláveis (PWA)

- **Caixa (tablet):** abra `caixa.html` no Chrome do tablet → **📲 Instalar app do caixa** (ou menu ⋮ → *Instalar app*). Ele abre em **tela cheia**, com ícone próprio e separado do app do cliente. No iPad: Safari → Compartilhar → *Adicionar à Tela de Início*.
- **Cliente (opcional):** aparece o botão **📲 Instalar** no topo; quem não quiser instalar usa normalmente pelo navegador.
- **Tela sempre ligada:** ao tocar em **Iniciar turno**, o caixa pede ao sistema para não apagar a tela (Wake Lock). Em aparelhos sem esse recurso, usa um vídeo mudo em loop como reserva. O botão **☀️ Tela ligada** no topo liga/desliga. Mesmo assim, mantenha o tablet **na tomada**.

## Atualização automática (a cada push)

**Todo push na `main` que o GitHub Pages publicar chega sozinho em todos os aparelhos** (tablet, celular e computador). Não precisa mudar número de versão.

Como funciona: o app guarda a "assinatura" dos próprios arquivos no servidor (ETag, data e tamanho, lidos só pelos cabeçalhos, sem baixar nada). A cada **1 minuto** com o app na tela, e também ao voltar para o app, ao ganhar foco e ao reconectar na internet, ele confere de novo. Se algo mudou:
- **Cliente:** recarrega na hora. Carrinho, nome e comanda ficam salvos. Se a pessoa estiver com uma janela aberta (escolhendo um item ou na sacola), espera ela fechar.
- **Caixa:** recarrega assim que ficar **10 s sem ninguém tocar** (ou 1 min se houver um campo em edição). Pedidos, rascunho do cardápio, PIN da sessão e aba aberta continuam iguais. Se o navegador não liberar o som sozinho depois de recarregar, aparece uma faixa amarela: **"Toque em qualquer lugar para reativar o som"**.
- Ao voltar para o app (celular estava em segundo plano), o cardápio e o status da loja são buscados de novo na hora.

O GitHub Pages leva cerca de 1 minuto para publicar depois do push. Somando a checagem, a atualização chega aos aparelhos em até uns 2 minutos.

## Produtos em 3D

Cada produto tem uma ilustração vetorial com volume, brilho e sombra, que flutua na vitrine. Na janela do produto, o cliente **arrasta o dedo para girar** (no Android, também inclina com o celular). A lata, a garrafa, o suco e o refresco **mudam de cor conforme o sabor** escolhido. No painel, cada produto tem o campo **Ilustração 3D** e o campo **Foto** (opcional): para usar foto real, coloque a imagem na pasta `img/` do repositório e preencha `img/nome.png`.

## Publicar no GitHub Pages

1. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
2. Cliente: `https://digitalrobertlima.github.io/pedidos-fila/`
3. Caixa: `https://digitalrobertlima.github.io/pedidos-fila/caixa.html`

## Primeiro uso

1. Abra `caixa.html` no tablet → **Iniciar turno** (libera o som).
2. Toque em **🔴 Loja FECHADA** para abrir a loja. Enquanto a loja estiver fechada, o app do cliente mostra "Loja fechada" e não envia pedidos.
3. Aba **Cardápio** → no primeiro acesso, **crie o PIN** (4 a 8 números) → preencha os **Códigos PDV**, ajuste preços (o *Refrigerante 600ml* vem sem preço e fica indisponível até você definir) → **Publicar Atualização em Tempo Real**.
4. Gere um QR Code do link do cliente e coloque na fila.

## PIN do gerente

O PIN **não fica no código nem no GitHub**. Ele é criado no próprio tablet e guardado só como hash (PBKDF2-SHA256, 210 mil iterações, sal aleatório). Depois de 5 erros seguidos, a tela de PIN bloqueia por 60 segundos. Para trocar o PIN, use **🔑 Trocar PIN** dentro do painel.
**Esqueceu o PIN?** Exporte o cardápio antes, se possível. Depois apague os dados do site no navegador do tablet: o sistema vai pedir um PIN novo, e o cardápio publicado volta do ntfy.sh.

## Loja aberta / fechada

O botão no topo do caixa publica o status. "Aberta" vale 15 min e o tablet renova sozinho a cada 10 min. Se o tablet desligar ou perder a internet, a loja aparece **fechada** para os clientes em até 15 min. Ao fechar a aba do caixa, os clientes recebem "fechada" na hora. Antes de enviar cada pedido, o app do cliente confere de novo se a loja está aberta.

## Como funciona

- **Pedidos**: o celular publica o pedido (JSON comprimido) no tópico de pedidos; o tablet escuta via SSE, toca o alerta e guarda no `localStorage`. Se o tablet ficar offline, ao reconectar ele busca os pedidos perdidos (o ntfy.sh guarda ~12h).
- **Cardápio**: ao publicar, o tablet envia o cardápio no tópico de cardápio; quem estiver com o app aberto recebe na hora, sem recarregar. Enquanto o tablet estiver aberto, ele republica a cada 6h para o cardápio nunca expirar no ntfy.sh.
- **Comanda digital**: aparece no celular assim que o cliente toca em "Enviar" (mesmo sem internet), com os códigos PDV, para mostrar no balcão.
- **Liga/desliga, preço, promoção**: só chegam aos clientes depois de **Publicar**. O painel avisa quando há alterações não publicadas.

## Limitações conhecidas (v1)

- Tópicos do ntfy.sh são públicos para quem souber o nome: não compartilhe o `config.js` fora do repositório e use nomes aleatórios.
- O PIN protege só o painel deste tablet. Como os tópicos são públicos, quem descobrir o nome do tópico de cardápio poderia publicar nele.
- O número do pedido (`#P-123`) tem 3 dígitos aleatórios; repetições no mesmo dia são raras e não causam erro (cada pedido tem um id interno único).
- O histórico de pedidos fica só no tablet (localStorage).

## Licença

Todos os direitos reservados. Veja [LICENSE](LICENSE).
