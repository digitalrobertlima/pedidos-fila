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
 *  - O PIN do gerente NÃO fica neste arquivo nem no GitHub: é
 *    criado no tablet e salvo só como hash criptográfico.
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

  // O PIN do gerente NÃO fica aqui: ele é criado no próprio tablet no
  // primeiro acesso e guardado apenas como hash (PBKDF2 + sal) no aparelho.

  /**
   * O ntfy.sh guarda mensagens por ~12h. Enquanto o tablet do caixa
   * estiver aberto, ele republica o cardápio automaticamente nesse
   * intervalo para que clientes novos sempre recebam a versão atual.
   */
  republicarCardapioACadaHoras: 6,
};
