# pedidos-fila

Sistema de autoatendimento para fila e gestão de pedidos — **White-Label**, 100% estático (GitHub Pages), sem backend e sem banco de dados pago. A comunicação em tempo real usa o serviço gratuito [ntfy.sh](https://ntfy.sh).

| Página | Uso |
|---|---|
| `index.html` | App do cliente (celular): nome → cardápio → carrinho → pagamento → **comanda digital** |
| `caixa.html` | Tablet do caixa: **Fila de Pedidos** + **Gestão do Cardápio** (PIN) |

## Arquivos

```
config.js          ← ÚNICO arquivo a editar por loja (nome, cor, tópicos ntfy, PIN)
cardapio-seed.js   ← cardápio inicial de fábrica
comum.js           ← funções compartilhadas (ntfy, compressão, regras do cardápio)
index.html / cliente.js / style.css
caixa.html / caixa.js
manifest.json / sw.js / icon.svg   ← PWA (instalar na tela inicial, abre offline)
```

## Publicar no GitHub Pages

1. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
2. Cliente: `https://digitalrobertlima.github.io/pedidos-fila/`
3. Caixa: `https://digitalrobertlima.github.io/pedidos-fila/caixa.html`

## Primeiro uso

1. **Edite o `config.js`**: troque o `pinAdmin` (padrão `1234`). Se quiser, troque os tópicos por outros nomes longos e aleatórios.
2. Abra `caixa.html` no tablet → **Iniciar turno** (libera o som).
3. Aba **Cardápio** → PIN → preencha os **Códigos PDV**, ajuste preços (o *Refrigerante 600ml* vem sem preço e fica indisponível até você definir) → **Publicar Atualização em Tempo Real**.
4. Gere um QR Code do link do cliente e coloque na fila.

## Como funciona

- **Pedidos**: o celular publica o pedido (JSON comprimido) no tópico de pedidos; o tablet escuta via SSE, toca o alerta e guarda no `localStorage`. Se o tablet ficar offline, ao reconectar ele busca os pedidos perdidos (o ntfy.sh guarda ~12h).
- **Cardápio**: ao publicar, o tablet envia o cardápio no tópico de cardápio; quem estiver com o app aberto recebe na hora, sem recarregar. Enquanto o tablet estiver aberto, ele republica a cada 6h para o cardápio nunca expirar no ntfy.sh.
- **Comanda digital**: aparece no celular assim que o cliente toca em "Enviar" (mesmo sem internet), com os códigos PDV, para mostrar no balcão.
- **Liga/desliga, preço, promoção**: só chegam aos clientes depois de **Publicar**. O painel avisa quando há alterações não publicadas.

## Limitações conhecidas (v1)

- Tópicos do ntfy.sh são públicos para quem souber o nome: não compartilhe o `config.js` fora do repositório e use nomes aleatórios.
- O PIN fica no código do site: evita mexidas acidentais, mas não é segurança forte.
- O número do pedido (`#P-123`) tem 3 dígitos aleatórios; repetições no mesmo dia são raras e não causam erro (cada pedido tem um id interno único).
- O histórico de pedidos fica só no tablet (localStorage).

## Licença

Todos os direitos reservados. Veja [LICENSE](LICENSE).
