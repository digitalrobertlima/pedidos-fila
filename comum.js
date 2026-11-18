/**
 * ============================================================
 *  comum.js — FUNÇÕES COMPARTILHADAS (cliente + caixa)
 * ============================================================
 *  - Aplicação do tema White-Label (cor, nome)
 *  - Formatação de dinheiro e escapes de HTML
 *  - Armazenamento local (localStorage com prefixo por loja)
 *  - Comunicação em tempo real com ntfy.sh:
 *      publicar()          → POST de um JSON num tópico
 *      escutar()           → SSE (EventSource) com reconexão automática
 *      buscarUltima()      → lê a última mensagem retida no tópico
 *    As mensagens são comprimidas (gzip + base64) para caber no
 *    limite de 4 KB por mensagem do ntfy.sh.
 *  - Regras do cardápio (disponibilidade, código PDV)
 * ============================================================
 */

/* ---------------------- TEMA / MARCA ---------------------- */

/** Aplica nome e cores do config.js na página. */
function aplicarTema() {
  const raiz = document.documentElement.style;
  raiz.setProperty('--cor', CONFIG.corPrimaria);
  raiz.setProperty('--cor-promo', CONFIG.corPromocao);
  document.querySelectorAll('[data-nome-loja]').forEach((el) => (el.textContent = CONFIG.nomeLoja));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = CONFIG.corPrimaria;
}

/* ---------------------- UTILITÁRIOS ---------------------- */

/** Formata número como moeda brasileira: 3.5 → "R$ 3,50". */
function dinheiro(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Escapa texto para inserir com segurança dentro de HTML. */
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Gera um id aleatório curto. */
function gerarId(prefixo = 'id') {
  return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Cópia profunda simples (o cardápio é JSON puro). */
function clonar(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ---------------------- ARMAZENAMENTO ---------------------- */

const Armazenamento = {
  chave(nome) {
    return `${CONFIG.lojaId}:${nome}`;
  },
  ler(nome, padrao = null) {
    try {
      const bruto = localStorage.getItem(this.chave(nome));
      return bruto ? JSON.parse(bruto) : padrao;
    } catch {
      return padrao;
    }
  },
  salvar(nome, valor) {
    try {
      localStorage.setItem(this.chave(nome), JSON.stringify(valor));
    } catch (e) {
      console.warn('Não foi possível salvar no localStorage', e);
    }
  },
  remover(nome) {
    localStorage.removeItem(this.chave(nome));
  },
};

/* ---------------------- COMPRESSÃO ---------------------- */

function _bufParaBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function _base64ParaBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Comprime texto em gzip+base64 (prefixo "gz:"). Sem suporte no navegador, devolve o texto puro. */
async function comprimir(texto) {
  if (typeof CompressionStream === 'undefined') return texto;
  const fluxo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
  return 'gz:' + _bufParaBase64(await new Response(fluxo).arrayBuffer());
}

/** Desfaz comprimir(). Aceita também texto puro. */
async function descomprimir(texto) {
  if (!texto.startsWith('gz:')) return texto;
  const fluxo = new Blob([_base64ParaBytes(texto.slice(3))]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(fluxo).text();
}

/* ---------------------- NTFY.SH ---------------------- */

const Ntfy = {
  url(topico) {
    return `${CONFIG.ntfyServidor.replace(/\/$/, '')}/${encodeURIComponent(topico)}`;
  },

  /**
   * Publica um envelope { tipo, loja, enviadoEm, dados } no tópico.
   * Lança erro se a rede falhar.
   */
  async publicar(topico, tipo, dados, opcoes = {}) {
    const envelope = { tipo, loja: CONFIG.lojaId, enviadoEm: new Date().toISOString(), dados };
    const json = JSON.stringify(envelope);
    // opcoes.semCompressao: envio síncrono (usado ao fechar a aba, quando não dá tempo de comprimir)
    const corpo = opcoes.semCompressao ? json : await comprimir(json);
    const resp = await fetch(this.url(topico), { method: 'POST', body: corpo, keepalive: !!opcoes.keepalive });
    if (!resp.ok) throw new Error(`ntfy respondeu ${resp.status}`);
    return resp.json();
  },

  /** Converte um evento "message" do ntfy no envelope original (ou null se não for nosso). */
  async decodificar(evento) {
    if (!evento || evento.event !== 'message') return null;
    try {
      let texto = evento.message || '';
      // Mensagens grandes viram anexo no ntfy: baixamos o conteúdo.
      if (evento.attachment && evento.attachment.url) texto = await (await fetch(evento.attachment.url)).text();
      const envelope = JSON.parse(await descomprimir(texto));
      if (!envelope || envelope.loja !== CONFIG.lojaId) return null;
      envelope.ntfyId = evento.id;
      return envelope;
    } catch (e) {
      console.warn('Mensagem ignorada (formato inválido)', e);
      return null;
    }
  },

  /**
   * Busca as mensagens retidas no tópico (o ntfy.sh guarda ~12h)
   * e devolve a ÚLTIMA do tipo pedido.
   */
  async buscarUltima(topico, tipo) {
    const resp = await fetch(`${this.url(topico)}/json?poll=1&since=all`);
    if (!resp.ok) throw new Error(`ntfy respondeu ${resp.status}`);
    const linhas = (await resp.text()).trim().split('\n').filter(Boolean).reverse();
    for (const linha of linhas) {
      const env = await this.decodificar(JSON.parse(linha));
      if (env && env.tipo === tipo) return env;
    }
    return null;
  },

  /**
   * Escuta o tópico em tempo real via SSE, com reconexão automática.
   * @param {string} topico
   * @param {(envelope) => void} aoReceber
   * @param {object} opcoes { since: () => string|null, aoStatus: (online:boolean) => void }
   * @returns {() => void} função para parar de escutar
   */
  escutar(topico, aoReceber, opcoes = {}) {
    let fonte = null;
    let parado = false;
    let timer = null;

    const conectar = () => {
      if (parado) return;
      const since = opcoes.since ? opcoes.since() : null;
      fonte = new EventSource(`${this.url(topico)}/sse${since ? `?since=${encodeURIComponent(since)}` : ''}`);
      fonte.onopen = () => opcoes.aoStatus && opcoes.aoStatus(true);
      fonte.onmessage = async (msg) => {
        const env = await this.decodificar(JSON.parse(msg.data));
        if (env) aoReceber(env);
      };
      fonte.onerror = () => {
        opcoes.aoStatus && opcoes.aoStatus(false);
        fonte.close();
        clearTimeout(timer);
        timer = setTimeout(conectar, 3000); // tenta de novo em 3s
      };
    };

    // Ao voltar a internet ou o app voltar ao primeiro plano, reconecta na hora.
    const reconectarJa = () => {
      if (parado || (fonte && fonte.readyState === EventSource.OPEN)) return;
      if (fonte) fonte.close();
      clearTimeout(timer);
      conectar();
    };
    window.addEventListener('online', reconectarJa);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reconectarJa());

    conectar();
    return () => {
      parado = true;
      clearTimeout(timer);
      if (fonte) fonte.close();
    };
  },
};

/* ---------------------- STATUS DA LOJA (aberta/fechada) ---------------------- */
/*
 * O caixa publica no tópico do cardápio uma mensagem tipo 'status':
 *   { aberta: true|false, validoAte: ISO }
 * "Aberta" funciona como um aluguel: vale até validoAte e o caixa renova
 * periodicamente. Se o tablet desligar/travar sem avisar, a loja passa a
 * aparecer FECHADA sozinha quando o prazo vence.
 */
const STATUS_VALIDADE_MIN = 15; // minutos de validade de cada "aberta"
const STATUS_RENOVAR_MIN = 10;  // o caixa renova antes de vencer

function lojaEstaAberta(status) {
  return !!(status && status.aberta && status.validoAte && new Date(status.validoAte).getTime() > Date.now());
}

/* ---------------------- REGRAS DO CARDÁPIO ---------------------- */

const Cardapio = {
  /** Encontra um item pelo id. */
  item(cardapio, id) {
    return cardapio.itens.find((i) => i.id === id);
  },

  /** Opções (sabores) ativas de um item. */
  opcoesAtivas(item) {
    return (item.opcoes || []).filter((o) => o.ativo);
  },

  /**
   * Um item está disponível se: ativo, preço > 0 e
   *  - simples com opções: ao menos 1 opção ativa
   *  - combo: todos os itens das partes disponíveis
   */
  disponivel(cardapio, item, _profundidade = 0) {
    if (!item || !item.ativo) return false;
    if (_profundidade === 0 && !(item.preco > 0)) return false;
    if (item.tipo === 'combo') {
      if (!item.slots || !item.slots.length) return false;
      return item.slots.every((s) => {
        const fonte = this.item(cardapio, s.itemId);
        return fonte && fonte.ativo && (!fonte.opcoes.length || this.opcoesAtivas(fonte).length > 0) && s.quantidade > 0;
      });
    }
    return !item.opcoes.length || this.opcoesAtivas(item).length > 0;
  },

  /** Garante que um JSON importado/recebido tenha a estrutura esperada. */
  normalizar(c) {
    if (!c || !Array.isArray(c.categorias) || !Array.isArray(c.itens)) throw new Error('Cardápio inválido');
    c.itens.forEach((i) => {
      i.opcoes = Array.isArray(i.opcoes) ? i.opcoes : [];
      i.slots = Array.isArray(i.slots) ? i.slots : [];
      i.tipo = i.tipo === 'combo' ? 'combo' : 'simples';
      i.preco = Number(i.preco) || 0;
      i.codigoPdv = i.codigoPdv ?? '';
      i.ativo = i.ativo !== false;
      i.promocao = !!i.promocao;
      i.opcoes.forEach((o) => {
        o.codigoPdv = o.codigoPdv ?? '';
        o.ativo = o.ativo !== false;
      });
      i.slots.forEach((s) => (s.quantidade = Math.max(1, parseInt(s.quantidade, 10) || 1)));
    });
    return c;
  },
};

/* ---------------------- PEDIDO → TEXTO PARA O PDV ---------------------- */

/** Formata o código PDV em destaque (ou "—" se não cadastrado). */
function codPdv(codigo) {
  return `<span class="cod">[CÓD: ${esc(codigo || '—')}]</span>`;
}

/**
 * Gera o HTML da lista de itens de um pedido, com códigos PDV.
 * Usado na comanda do cliente e no cartão do caixa.
 */
function htmlItensPedido(itens) {
  return itens
    .map((linha) => {
      if (linha.tipo === 'combo') {
        const partes = linha.partes
          .map((p) =>
            p.sabores
              .map((s) => `<li>${codPdv(s.codigoPdv)} ${s.qtd}x ${esc(p.itemNome)}${s.nome ? ` — <b>${esc(s.nome)}</b>` : ''}</li>`)
              .join('')
          )
          .join('');
        return `<li class="linha-combo">${codPdv(linha.codigoPdv)} ${linha.qtd}x <b>${esc(linha.nome)}</b> <span class="preco">${dinheiro(linha.preco * linha.qtd)}</span><ul>${partes}</ul></li>`;
      }
      return `<li>${codPdv(linha.codigoPdv)} ${linha.qtd}x ${esc(linha.nome)}${linha.sabor ? ` — <b>${esc(linha.sabor)}</b>` : ''} <span class="preco">${dinheiro(linha.preco * linha.qtd)}</span></li>`;
    })
    .join('');
}

/** Rótulo da forma de pagamento, incluindo troco. */
function textoPagamento(pedido) {
  const nomes = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
  let t = nomes[pedido.pagamento] || pedido.pagamento;
  if (pedido.pagamento === 'dinheiro' && pedido.trocoPara) t += ` — troco p/ ${dinheiro(pedido.trocoPara)} (${dinheiro(pedido.trocoPara - pedido.total)})`;
  return t;
}
