/**
 * ============================================================
 *  config.js — CONFIGURAÇÃO WHITE-LABEL DA LOJA
 * ============================================================
 *  Este é o ÚNICO arquivo que precisa ser alterado para colocar
 *  o sistema em outra loja. Para multi-lojas no futuro, basta
 *  duplicar o repositório (ou criar um config por loja) com
 *  tópicos diferentes.
 *
 *  ⚠️ SEGURANÇA:
 *  - Os tópicos do ntfy.sh são PÚBLICOS: quem souber o nome pode
 *    ler/publicar. Por isso use nomes longos e aleatórios.
 *  - O PIN fica no código do site (visível para quem abrir o
 *    código-fonte). Ele evita mexidas acidentais, mas não é uma
 *    proteção forte. Troque-o e não divulgue o link do caixa.
 * ============================================================
 */
const CONFIG = {
  /** Identificador interno da loja (usado para separar dados no localStorage). */
  lojaId: 'pastelandia',

  /** Nome exibido no topo do app e na comanda. */
  nomeLoja: 'Pastelândia',

  /** Frase curta exibida abaixo do nome no app do cliente. */
  slogan: 'Peça pela fila e retire no balcão',

  /** Cor principal da marca (botões, abas, destaques). */
  corPrimaria: '#e85d04',

  /** Cor de destaque para promoções. */
  corPromocao: '#d00000',

  /** Servidor ntfy (pode ser o público ou um próprio, no futuro). */
  ntfyServidor: 'https://ntfy.sh',

  /** Tópico onde os clientes publicam os pedidos e o caixa escuta. */
  topicoPedidos: 'pastelandia-pedidos-426bb334e3',

  /** Tópico onde o caixa publica o cardápio e os clientes escutam. */
  topicoCardapio: 'pastelandia-cardapio-426bb334e3',

  /** PIN numérico para acessar a gestão do cardápio no tablet. */
  pinAdmin: '1234',

  /**
   * O ntfy.sh guarda mensagens por ~12h. Enquanto o tablet do caixa
   * estiver aberto, ele republica o cardápio automaticamente nesse
   * intervalo para que clientes novos sempre recebam a versão atual.
   */
  republicarCardapioACadaHoras: 6,
};
