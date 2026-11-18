/**
 * ============================================================
 *  caixa.js — PAINEL DO TABLET DO CAIXA (caixa.html)
 * ============================================================
 *  Aba 1 — Fila de Pedidos:
 *    recebe pedidos ao vivo (SSE ntfy.sh), toca alerta sonoro,
 *    guarda no localStorage e mostra os CÓDIGOS PDV em destaque.
 *  Aba 2 — Gestão do Cardápio (PIN):
 *    CRUD de categorias, produtos, combos e sabores; código PDV;
 *    liga/desliga; promoção; publicar em tempo real; backup JSON.
 *
 *  Chaves no localStorage (prefixadas pelo lojaId):
 *    pedidos           → lista de pedidos do dia
 *    ultimoIdPedidos   → último id do ntfy lido (recupera pedidos
 *                        que chegaram com o tablet desconectado)
 *    cardapio          → cardápio PUBLICADO
 *    rascunho          → cardápio em edição (ainda não publicado)
 *    publicadoEm       → data da última publicação
 * ============================================================
 */

const $ = (sel) => document.querySelector(sel);

const estado = {
  pedidos: Armazenamento.ler('pedidos', []),
  cardapio: null, // publicado
  rascunho: null, // em edição
  audio: null,
};

/* ====================== INICIALIZAÇÃO ====================== */

document.addEventListener('DOMContentLoaded', async () => {
  aplicarTema();
  document.title = `${CONFIG.nomeLoja} — Caixa`;
  ligarEventos();
  renderPedidos();
  prepararAppDoCaixa();

  await carregarCardapio();

  // Volta para a aba que estava aberta antes de recarregar (ex: atualização automática).
  const painel = sessionStorage.getItem('painel');
  if (painel) trocarPainel(painel);

  // Pedidos ao vivo
  Ntfy.escutar(CONFIG.topicoPedidos, receberPedido, {
    // Sem id salvo (primeiro uso ou dados apagados), recupera a última 1h de pedidos.
    since: () => Armazenamento.ler('ultimoIdPedidos') || '1h',
    aoStatus: (online) => {
      const el = $('#status-conexao');
      el.classList.toggle('online', online);
      el.textContent = online ? '● Online' : '● Reconectando…';
    },
  });

  // Status da loja: se estava aberta antes de recarregar, reafirma.
  renderBotaoLoja();
  if (Armazenamento.ler('lojaAberta', false)) publicarStatus(true);
  setInterval(() => Armazenamento.ler('lojaAberta', false) && publicarStatus(true), STATUS_RENOVAR_MIN * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Armazenamento.ler('lojaAberta', false)) publicarStatus(true);
  });
  // Ao fechar a aba do caixa, avisa os clientes que a loja fechou.
  window.addEventListener('pagehide', () => {
    if (Armazenamento.ler('lojaAberta', false)) {
      Ntfy.publicar(CONFIG.topicoCardapio, 'status', { aberta: false, validoAte: null }, { semCompressao: true, keepalive: true }).catch(() => {});
    }
  });

  // Mantém o cardápio sempre retido no ntfy.sh (ele guarda só ~12h).
  setInterval(republicarSeNecessario, 10 * 60 * 1000);
  republicarSeNecessario();
});

/** Carrega cardápio publicado: local → ntfy → seed. */
async function carregarCardapio() {
  let c = Armazenamento.ler('cardapio');
  if (!c) {
    try {
      const env = await Ntfy.buscarUltima(CONFIG.topicoCardapio, 'cardapio');
      if (env) c = env.dados;
    } catch (e) {
      console.warn(e);
    }
  }
  estado.cardapio = Cardapio.normalizar(clonar(c || CARDAPIO_SEED));
  Armazenamento.salvar('cardapio', estado.cardapio);
  estado.rascunho = Cardapio.normalizar(Armazenamento.ler('rascunho') || clonar(estado.cardapio));
}

/* ====================== APP DO CAIXA (PWA) ====================== */
/*
 * - Instalação como app de tela cheia (manifest-caixa.json)
 * - Tela sempre ligada (Wake Lock API; reserva: vídeo mudo em loop)
 * - Atualização automática: ao sair versão nova, o caixa recarrega
 *   sozinho num momento seguro (sem pedidos pendentes, sem edição
 *   não publicada e sem ninguém mexendo há 1 min). Também há botão
 *   "Atualizar agora".
 * - Turno: depois do 1º "Iniciar turno", recarregar não exige novo
 *   toque se o navegador permitir som automaticamente.
 */

const TelaLigada = {
  trava: null,
  preferida() {
    return Armazenamento.ler('telaLigada', true);
  },
  ativa() {
    return (this.trava && !this.trava.released) || !$('#video-acordado').paused;
  },
  async ligar() {
    if (!this.preferida() || document.visibilityState !== 'visible') return this.render();
    try {
      if ('wakeLock' in navigator) {
        if (!this.ativa()) {
          this.trava = await navigator.wakeLock.request('screen');
          this.trava.addEventListener('release', () => this.render());
        }
      } else {
        await $('#video-acordado').play();
      }
    } catch (e) {
      // Sem Wake Lock (ou recusado): tenta o vídeo mudo em loop.
      try {
        await $('#video-acordado').play();
      } catch {}
    }
    this.render();
  },
  async desligar() {
    if (this.trava) await this.trava.release().catch(() => {});
    this.trava = null;
    $('#video-acordado').pause();
    this.render();
  },
  async alternar() {
    Armazenamento.salvar('telaLigada', !this.preferida());
    if (this.preferida()) {
      await this.ligar();
      mostrarAviso(this.ativa() ? '☀️ A tela não vai apagar' : 'Este aparelho não permite manter a tela ligada. Ajuste o "tempo de tela" nas configurações.');
    } else {
      await this.desligar();
      mostrarAviso('🌙 A tela pode apagar normalmente');
    }
  },
  render() {
    const b = $('#btn-tela');
    const ok = this.ativa();
    b.classList.toggle('ligado', ok);
    b.textContent = ok ? '☀️ Tela ligada' : this.preferida() ? '⚠️ Tela pode apagar' : '🌙 Tela normal';
  },
};

let _ultimaInteracao = Date.now();

function prepararAppDoCaixa() {
  App.configurarInstalacao($('#btn-instalar'));
  App.configurarInstalacao($('#btn-instalar-inicio'));

  // Evita que o navegador apague os pedidos/cardápio salvos por falta de espaço.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // Tela cheia (some se o app já estiver instalado ou o aparelho não suportar).
  if (!document.documentElement.requestFullscreen || App.instalado()) $('#btn-tela-cheia').hidden = true;

  // Reativa a tela ligada sempre que o app volta ao primeiro plano.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && TelaLigada.ligar());
  TelaLigada.render();

  // Atualização automática: cada push no GitHub vira versão nova no tablet.
  App.iniciarAtualizacao(() => {
    $('#banner-atualizacao').hidden = false;
    atualizarSeSeguro();
    setInterval(atualizarSeSeguro, 3000);
  });
  ['pointerdown', 'keydown', 'input'].forEach((ev) => document.addEventListener(ev, () => (_ultimaInteracao = Date.now()), true));

  // Turno já iniciado antes (ex: após atualização): segue sem tela de bloqueio.
  // Se o navegador não liberar o som sozinho, mostra uma faixa pedindo um toque.
  if (Armazenamento.ler('turnoAtivo', false)) {
    $('#desbloqueio').hidden = true;
    iniciarAudio();
    TelaLigada.ligar();
    setTimeout(verificarSom, 400);
  }
  // Qualquer toque na tela reativa som e tela ligada.
  document.addEventListener('pointerdown', () => {
    if (!Armazenamento.ler('turnoAtivo', false)) return;
    iniciarAudio();
    if (!TelaLigada.ativa()) TelaLigada.ligar();
    setTimeout(verificarSom, 200);
  });
}

/** Mostra a faixa "toque para reativar o som" se o áudio estiver bloqueado. */
function verificarSom() {
  const ok = estado.audio && estado.audio.state === 'running';
  $('#aviso-som').hidden = ok || !Armazenamento.ler('turnoAtivo', false);
}

function iniciarTurno() {
  iniciarAudio();
  TelaLigada.ligar();
  Armazenamento.salvar('turnoAtivo', true);
  $('#desbloqueio').hidden = true;
}

/**
 * Recarrega para a versão nova assim que ninguém estiver mexendo (10s sem toque
 * e sem campo em edição). Nada se perde: pedidos, rascunho do cardápio, PIN da
 * sessão e aba aberta ficam salvos no aparelho.
 */
let _recarregando = false;
function atualizarSeSeguro() {
  const semMexer = Date.now() - _ultimaInteracao;
  const campoComFoco = document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  // Com um campo em foco, espera 1 min sem mexer (pode estar digitando); senão, 10s.
  if (semMexer > (campoComFoco ? 60000 : 10000)) recarregarAgora();
}

function recarregarAgora() {
  _recarregando = true;
  location.reload();
}

function alternarTelaCheia() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

/* ====================== LOJA ABERTA / FECHADA ====================== */

/** Publica o status. "Aberta" vale por STATUS_VALIDADE_MIN e é renovada. */
async function publicarStatus(aberta) {
  const validoAte = aberta ? new Date(Date.now() + STATUS_VALIDADE_MIN * 60000).toISOString() : null;
  try {
    await Ntfy.publicar(CONFIG.topicoCardapio, 'status', { aberta, validoAte });
    return true;
  } catch (e) {
    console.warn('Falha ao publicar status da loja', e);
    return false;
  }
}

function renderBotaoLoja() {
  const aberta = Armazenamento.ler('lojaAberta', false);
  const b = $('#btn-loja');
  b.className = `btn-loja ${aberta ? 'aberta' : 'fechada'}`;
  b.textContent = aberta ? '🟢 Loja ABERTA — tocar para fechar' : '🔴 Loja FECHADA — tocar para abrir';
}

async function alternarLoja() {
  const abrir = !Armazenamento.ler('lojaAberta', false);
  if (!abrir && !confirm('Fechar a loja? Os clientes não conseguirão mais enviar pedidos pela fila.')) return;
  const b = $('#btn-loja');
  b.disabled = true;
  b.textContent = '⏳ Atualizando…';
  const ok = await publicarStatus(abrir);
  b.disabled = false;
  if (!ok) {
    renderBotaoLoja();
    return alert('Sem internet: não foi possível avisar os clientes. Tente de novo.');
  }
  Armazenamento.salvar('lojaAberta', abrir);
  renderBotaoLoja();
  mostrarAviso(abrir ? '🟢 Loja aberta para pedidos' : '🔴 Loja fechada');
}

/* ====================== ÁUDIO (Web Audio API) ====================== */

/** Precisa ser chamado após um toque do usuário (regra dos navegadores). */
function iniciarAudio() {
  if (!estado.audio) estado.audio = new (window.AudioContext || window.webkitAudioContext)();
  if (estado.audio.state === 'suspended') estado.audio.resume();
}

/** Toca 3 bipes curtos e agudos. */
function bip() {
  const ctx = estado.audio;
  if (!ctx) return;
  const agora = ctx.currentTime;
  [0, 0.25, 0.5].forEach((atraso, i) => {
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = i === 2 ? 1320 : 880;
    ganho.gain.setValueAtTime(0.0001, agora + atraso);
    ganho.gain.exponentialRampToValueAtTime(0.4, agora + atraso + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, agora + atraso + 0.2);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(agora + atraso);
    osc.stop(agora + atraso + 0.22);
  });
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

/* ====================== ABA 1: FILA DE PEDIDOS ====================== */

function receberPedido(env) {
  if (env.ntfyId) Armazenamento.salvar('ultimoIdPedidos', env.ntfyId);
  if (env.tipo !== 'pedido' || !env.dados || !env.dados.uid) return;
  if (estado.pedidos.some((p) => p.pedido.uid === env.dados.uid)) return; // duplicado

  estado.pedidos.push({ pedido: env.dados, recebidoEm: new Date().toISOString(), status: 'pendente' });
  salvarPedidos();
  bip();
  verificarSom();
  mostrarAviso(`Novo pedido #${env.dados.numero} — ${env.dados.nome}`);
}

function salvarPedidos() {
  Armazenamento.salvar('pedidos', estado.pedidos);
  renderPedidos();
}

function cartaoPedido(reg) {
  const p = reg.pedido;
  const hora = new Date(p.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const pendente = reg.status === 'pendente';
  return `
  <article class="cartao-pedido ${pendente ? 'novo' : ''}">
    <header>
      <span class="num">#${esc(p.numero)}</span>
      <span class="hora">${hora}</span>
    </header>
    <p class="cliente-nome">${esc(p.nome)}</p>
    <p class="pagto">💳 ${esc(textoPagamento(p))}</p>
    <ul class="itens-pedido">${htmlItensPedido(p.itens)}</ul>
    <p class="total">Total: <strong>${dinheiro(p.total)}</strong></p>
    ${
      pendente
        ? `<button class="btn primario grande" data-concluir="${esc(p.uid)}">✔ Concluir / Lançado no PDV</button>`
        : `<button class="btn secundario" data-reabrir="${esc(p.uid)}">↩ Voltar para a fila</button>`
    }
  </article>`;
}

function renderPedidos() {
  const pend = estado.pedidos.filter((r) => r.status === 'pendente');
  const hist = estado.pedidos.filter((r) => r.status !== 'pendente').reverse();
  $('#lista-pendentes').innerHTML = pend.map(cartaoPedido).join('') || '<p class="vazio">Nenhum pedido pendente. Aguardando…</p>';
  $('#lista-historico').innerHTML = hist.map(cartaoPedido).join('') || '<p class="vazio">Histórico vazio.</p>';
  $('#badge-pendentes').textContent = pend.length;
  document.title = `${pend.length ? `(${pend.length}) ` : ''}${CONFIG.nomeLoja} — Caixa`;
}

function mudarStatusPedido(uid, status) {
  const reg = estado.pedidos.find((r) => r.pedido.uid === uid);
  if (!reg) return;
  reg.status = status;
  reg.concluidoEm = status === 'concluido' ? new Date().toISOString() : null;
  salvarPedidos();
}

function limparHistorico() {
  if (!confirm('Apagar todo o histórico de pedidos concluídos?')) return;
  estado.pedidos = estado.pedidos.filter((r) => r.status === 'pendente');
  salvarPedidos();
}

/* ====================== ABA 2: GESTÃO DO CARDÁPIO ====================== */

/* ---------- PIN (nunca guardado em texto; só hash PBKDF2-SHA256 com sal) ---------- */
/*
 * O PIN é criado no próprio tablet no primeiro acesso. No localStorage fica
 * apenas { sal, hash, iteracoes } — não dá para ler o PIN de volta.
 * Após 5 erros seguidos, a entrada fica bloqueada por 60 segundos.
 * Esqueceu o PIN? Exporte o cardápio antes, se possível, e apague os
 * "dados do site" no navegador do tablet: o sistema pedirá um PIN novo.
 */
const PIN_ITERACOES = 210000;

async function hashPin(pin, salBase64, iteracoes = PIN_ITERACOES) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: _base64ParaBytes(salBase64), iterations: iteracoes },
    chave,
    256
  );
  return _bufParaBase64(bits);
}

async function salvarNovoPin(pin) {
  const sal = _bufParaBase64(crypto.getRandomValues(new Uint8Array(16)));
  Armazenamento.salvar('pinHash', { sal, hash: await hashPin(pin, sal), iteracoes: PIN_ITERACOES });
}

/** Valida formato: 4 a 8 dígitos. */
function pinValido(pin) {
  return /^\d{4,8}$/.test(pin);
}

function erroPin(msg) {
  $('#erro-pin').textContent = msg;
  $('#erro-pin').hidden = !msg;
}

/** Ajusta a tela do PIN: "criar" (primeiro acesso / troca) ou "entrar". */
function prepararTelaPin() {
  const criando = !Armazenamento.ler('pinHash') || estado.trocandoPin;
  $('#pin2').hidden = !criando;
  $('#pin-instrucao').textContent = estado.trocandoPin
    ? 'Digite o NOVO PIN (4 a 8 números) duas vezes.'
    : criando
    ? 'Primeiro acesso: crie um PIN de 4 a 8 números. Ele fica só neste tablet.'
    : 'Digite o PIN para editar o cardápio.';
  $('#btn-pin').textContent = criando ? 'Salvar PIN' : 'Entrar';
}

async function desbloquearAdmin() {
  const pin = $('#pin').value;
  const reg = Armazenamento.ler('pinHash');
  const criando = !reg || estado.trocandoPin;

  if (criando) {
    if (!pinValido(pin)) return erroPin('Use de 4 a 8 números.');
    if (pin !== $('#pin2').value) return erroPin('Os PINs não conferem.');
    await salvarNovoPin(pin);
    estado.trocandoPin = false;
    mostrarAviso('🔑 PIN salvo neste tablet.');
  } else {
    const bloqueio = Armazenamento.ler('pinBloqueio', { erros: 0, ate: 0 });
    if (Date.now() < bloqueio.ate) return erroPin(`Muitas tentativas. Aguarde ${Math.ceil((bloqueio.ate - Date.now()) / 1000)}s.`);
    if ((await hashPin(pin, reg.sal, reg.iteracoes)) !== reg.hash) {
      bloqueio.erros++;
      if (bloqueio.erros >= 5) bloqueio.ate = Date.now() + 60000;
      Armazenamento.salvar('pinBloqueio', bloqueio.erros >= 5 ? { erros: 0, ate: bloqueio.ate } : bloqueio);
      $('#pin').value = '';
      return erroPin('PIN incorreto.');
    }
    Armazenamento.remover('pinBloqueio');
  }

  sessionStorage.setItem('adminOk', '1');
  $('#pin').value = $('#pin2').value = '';
  erroPin('');
  mostrarEditor();
}

function trocarPin() {
  estado.trocandoPin = true;
  sessionStorage.removeItem('adminOk');
  mostrarEditor();
}

function mostrarEditor() {
  const ok = sessionStorage.getItem('adminOk') === '1';
  $('#bloqueio-pin').hidden = ok;
  $('#editor').hidden = !ok;
  if (ok) renderEditor();
  else {
    prepararTelaPin();
    $('#pin').focus();
  }
}

/** Salva o rascunho e mostra se há alterações não publicadas. */
function salvarRascunho() {
  Armazenamento.salvar('rascunho', estado.rascunho);
  $('#pendente-publicar').hidden = JSON.stringify(estado.rascunho) === JSON.stringify(estado.cardapio);
}

function renderEditor() {
  renderCategorias();
  renderEditorItens();
  salvarRascunho();
}

function renderCategorias() {
  const cats = estado.rascunho.categorias;
  $('#lista-categorias').innerHTML = cats
    .map(
      (c, i) => `
    <div class="linha-cat">
      <input value="${esc(c.icone || '')}" data-cat-icone="${i}" class="emoji-input" maxlength="4" aria-label="Emoji da categoria" />
      <input value="${esc(c.nome)}" data-cat-nome="${i}" aria-label="Nome da categoria" />
      <button class="btn mini" data-cat-mover="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>▲</button>
      <button class="btn mini" data-cat-mover="${i}" data-dir="1" ${i === cats.length - 1 ? 'disabled' : ''}>▼</button>
      <button class="btn mini perigo" data-cat-excluir="${i}">Excluir</button>
    </div>`
    )
    .join('');
}

/** HTML de um interruptor liga/desliga. */
function toggle(attrs, ligado, rotulo = '') {
  return `<label class="toggle" title="Disponível / Pausado"><input type="checkbox" ${attrs} ${ligado ? 'checked' : ''}/><span></span>${rotulo}</label>`;
}

function renderEditorItens() {
  const c = estado.rascunho;
  const simples = c.itens.filter((i) => i.tipo === 'simples');
  const abertos = new Set([...document.querySelectorAll('.ed-item[open]')].map((d) => d.dataset.id));

  $('#lista-editor-itens').innerHTML = c.categorias
    .map((cat) => {
      const itens = c.itens.filter((i) => i.categoriaId === cat.id);
      return `
      <section class="ed-categoria">
        <h3>${esc(cat.nome)} <small>(${itens.length})</small></h3>
        ${itens.map((item) => htmlEditorItem(item, abertos.has(item.id), simples)).join('')}
        <button class="btn secundario" data-novo-item="${esc(cat.id)}">+ Novo produto/combo em ${esc(cat.nome)}</button>
      </section>`;
    })
    .join('');

  // Itens órfãos (categoria excluída)
  const orfaos = c.itens.filter((i) => !c.categorias.some((cat) => cat.id === i.categoriaId));
  if (orfaos.length) {
    $('#lista-editor-itens').innerHTML += `<section class="ed-categoria"><h3>⚠ Sem categoria</h3>${orfaos
      .map((i) => htmlEditorItem(i, true, simples))
      .join('')}</section>`;
  }
}

function htmlEditorItem(item, aberto, simples) {
  const id = esc(item.id);
  const cats = estado.rascunho.categorias.map((c) => `<option value="${esc(c.id)}" ${c.id === item.categoriaId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');

  const opcoes = item.opcoes
    .map(
      (o, oi) => `
    <div class="linha-sub">
      ${toggle(`data-op-campo="ativo" data-i="${oi}"`, o.ativo)}
      <span class="mini" style="--fundo:${fundoItem(item, o.nome)}">${svgItem({ ...item, imagem: '' }, estado.rascunho, o.nome)}</span>
      <input value="${esc(o.nome)}" data-op-campo="nome" data-i="${oi}" placeholder="Sabor / variação" />
      <input value="${esc(o.codigoPdv)}" data-op-campo="codigoPdv" data-i="${oi}" placeholder="Cód. PDV" class="cod-input" />
      <button class="btn mini perigo" data-op-excluir="${oi}">✕</button>
    </div>`
    )
    .join('');

  const slots = item.slots
    .map((s, si) => {
      const ops = simples.map((x) => `<option value="${esc(x.id)}" ${x.id === s.itemId ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');
      return `
    <div class="linha-sub">
      <input value="${esc(s.nome)}" data-slot-campo="nome" data-i="${si}" placeholder="Nome da parte (ex: Pastéis)" />
      <input type="number" min="1" value="${s.quantidade}" data-slot-campo="quantidade" data-i="${si}" class="qtd-input" title="Quantidade" />
      <select data-slot-campo="itemId" data-i="${si}">${ops}</select>
      <button class="btn mini perigo" data-slot-excluir="${si}">✕</button>
    </div>`;
    })
    .join('');

  return `
  <details class="ed-item ${item.ativo ? '' : 'pausado'} ${item.promocao ? 'promo' : ''}" data-id="${id}" ${aberto ? 'open' : ''}>
    <summary>
      ${toggle(`data-campo="ativo"`, item.ativo)}
      <span class="mini" style="--fundo:${fundoItem(item)}">${svgItem(item, estado.rascunho)}</span>
      <span class="ed-nome">${esc(item.nome || '(sem nome)')}</span>
      ${item.promocao ? '<span class="selo">PROMO</span>' : ''}
      ${item.tipo === 'combo' ? '<span class="selo neutro">COMBO</span>' : ''}
      <span class="ed-cod">${item.codigoPdv ? `CÓD ${esc(item.codigoPdv)}` : 'sem cód.'}</span>
      <span class="ed-preco">${item.preco > 0 ? dinheiro(item.preco) : '<em>sem preço</em>'}</span>
    </summary>
    <div class="ed-corpo">
      <div class="grade-campos">
        <label>Nome<input value="${esc(item.nome)}" data-campo="nome" /></label>
        <label>Preço (R$)<input type="number" min="0" step="0.01" value="${item.preco}" data-campo="preco" /></label>
        <label>Código PDV<input value="${esc(item.codigoPdv)}" data-campo="codigoPdv" class="cod-input" /></label>
        <label>Categoria<select data-campo="categoriaId">${cats}</select></label>
        <label>Tipo<select data-campo="tipo">
          <option value="simples" ${item.tipo === 'simples' ? 'selected' : ''}>Produto simples</option>
          <option value="combo" ${item.tipo === 'combo' ? 'selected' : ''}>Combo</option>
        </select></label>
        <label>Ilustração 3D<select data-campo="ilustracao">${ILUSTRACOES.map(([v, t]) => `<option value="${v}" ${v === item.ilustracao ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-campo="promocao" ${item.promocao ? 'checked' : ''}/> Destacar como Promoção</label>
        <label class="largo">Descrição (opcional)<input value="${esc(item.descricao || '')}" data-campo="descricao" /></label>
        <label class="largo">Foto (opcional — link de imagem; se preenchido, substitui a ilustração 3D)<input type="url" value="${esc(item.imagem || '')}" data-campo="imagem" placeholder="https://… ou img/pastel.png" /></label>
      </div>
      ${
        item.tipo === 'simples'
          ? `<h4>Sabores / variações <small>(deixe vazio se o produto não tem)</small></h4>${opcoes}<button class="btn mini" data-op-novo>+ Sabor</button>`
          : `<h4>Partes do combo <small>(os sabores vêm do produto escolhido)</small></h4>${slots}<button class="btn mini" data-slot-novo>+ Parte</button>`
      }
      <div class="ed-acoes">
        <button class="btn mini" data-duplicar>Duplicar</button>
        <button class="btn mini perigo" data-excluir>Excluir produto</button>
      </div>
    </div>
  </details>`;
}

/** Item do rascunho a partir de um elemento dentro do <details>. */
function itemDoElemento(el) {
  const d = el.closest('.ed-item');
  return d && estado.rascunho.itens.find((i) => i.id === d.dataset.id);
}

/** Trata digitação/alteração de campos do editor. */
function aoEditarCampo(e) {
  const el = e.target;
  const item = itemDoElemento(el);
  if (!item) return;
  const valor = el.type === 'checkbox' ? el.checked : el.value;
  let redesenhar = false;

  if (el.dataset.campo) {
    const campo = el.dataset.campo;
    if (campo === 'preco') item.preco = parseFloat(valor) || 0;
    else item[campo] = valor;
    if (campo === 'tipo') {
      if (valor === 'combo') item.ilustracao = 'combo';
      if (valor === 'combo' && !item.slots.length) item.slots.push({ id: gerarId('s'), nome: 'Pastéis', quantidade: 1, itemId: primeiroSimples() });
      redesenhar = true;
    }
    if (['categoriaId', 'ativo', 'promocao', 'ilustracao', 'imagem'].includes(campo)) redesenhar = true;
    // Produto novo com nome digitado: escolhe a ilustração automaticamente.
    if (campo === 'nome' && e.type === 'change' && item.ilustracao === 'generico') {
      item.ilustracao = adivinharIlustracao(item);
      redesenhar = true;
    }
  } else if (el.dataset.opCampo) {
    item.opcoes[el.dataset.i][el.dataset.opCampo] = valor;
    if (el.dataset.opCampo === 'nome') redesenhar = true; // atualiza a cor da miniatura
  } else if (el.dataset.slotCampo) {
    const s = item.slots[el.dataset.i];
    s[el.dataset.slotCampo] = el.dataset.slotCampo === 'quantidade' ? Math.max(1, parseInt(valor, 10) || 1) : valor;
  } else return;

  // Só redesenha em mudanças estruturais (em 'change'), para não perder o foco ao digitar.
  if (redesenhar && e.type === 'change') renderEditorItens();
  salvarRascunho();
}

function primeiroSimples() {
  const s = estado.rascunho.itens.find((i) => i.tipo === 'simples');
  return s ? s.id : '';
}

/** Trata botões do editor de itens. */
function aoClicarEditor(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const c = estado.rascunho;

  if (b.dataset.novoItem) {
    const novo = { id: gerarId('item'), categoriaId: b.dataset.novoItem, nome: 'Novo produto', descricao: '', preco: 0, codigoPdv: '', ativo: true, promocao: false, tipo: 'simples', ilustracao: 'generico', imagem: '', opcoes: [], slots: [] };
    c.itens.push(novo);
    renderEditorItens();
    const d = document.querySelector(`.ed-item[data-id="${novo.id}"]`);
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'center' });
    salvarRascunho();
    return;
  }

  const item = itemDoElemento(b);
  if (!item) return;

  if ('opNovo' in b.dataset) item.opcoes.push({ id: gerarId('op'), nome: '', codigoPdv: '', ativo: true });
  else if (b.dataset.opExcluir) item.opcoes.splice(Number(b.dataset.opExcluir), 1);
  else if ('slotNovo' in b.dataset) item.slots.push({ id: gerarId('s'), nome: '', quantidade: 1, itemId: primeiroSimples() });
  else if (b.dataset.slotExcluir) item.slots.splice(Number(b.dataset.slotExcluir), 1);
  else if ('duplicar' in b.dataset) {
    const copia = clonar(item);
    copia.id = gerarId('item');
    copia.nome += ' (cópia)';
    copia.opcoes.forEach((o) => (o.id = gerarId('op')));
    copia.slots.forEach((s) => (s.id = gerarId('s')));
    c.itens.splice(c.itens.indexOf(item) + 1, 0, copia);
  } else if ('excluir' in b.dataset) {
    const usadoEm = c.itens.filter((x) => x.slots.some((s) => s.itemId === item.id)).map((x) => x.nome);
    const aviso = usadoEm.length ? `\n\nAtenção: ele é usado nos combos: ${usadoEm.join(', ')}.` : '';
    if (!confirm(`Excluir "${item.nome}"?${aviso}`)) return;
    c.itens.splice(c.itens.indexOf(item), 1);
  } else return;

  e.preventDefault();
  renderEditorItens();
  salvarRascunho();
}

/* ---------- Categorias ---------- */

function aoEditarCategoria(e) {
  if (e.target.dataset.catIcone !== undefined) {
    estado.rascunho.categorias[e.target.dataset.catIcone].icone = e.target.value;
    return salvarRascunho();
  }
  const i = e.target.dataset.catNome;
  if (i === undefined) return;
  estado.rascunho.categorias[i].nome = e.target.value;
  if (e.type === 'change') renderEditorItens();
  salvarRascunho();
}

function aoClicarCategoria(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const cats = estado.rascunho.categorias;
  if (b.dataset.catMover !== undefined) {
    const i = Number(b.dataset.catMover);
    const j = i + Number(b.dataset.dir);
    [cats[i], cats[j]] = [cats[j], cats[i]];
  } else if (b.dataset.catExcluir !== undefined) {
    const cat = cats[b.dataset.catExcluir];
    const n = estado.rascunho.itens.filter((x) => x.categoriaId === cat.id).length;
    if (n && !confirm(`A categoria "${cat.nome}" tem ${n} produto(s). Eles ficarão "sem categoria" (ocultos para o cliente). Continuar?`)) return;
    cats.splice(Number(b.dataset.catExcluir), 1);
  }
  renderEditor();
}

function novaCategoria() {
  const nome = prompt('Nome da nova categoria:');
  if (!nome || !nome.trim()) return;
  estado.rascunho.categorias.push({ id: gerarId('cat'), nome: nome.trim(), icone: emojiCategoria(nome) });
  renderEditor();
}

/* ---------- Publicar / Backup ---------- */

/** Verifica problemas antes de publicar. Retorna lista de avisos. */
function validarCardapio(c) {
  const avisos = [];
  c.itens.forEach((i) => {
    if (!i.nome.trim()) avisos.push('Há um produto sem nome.');
    if (i.tipo === 'combo') {
      if (!i.slots.length) avisos.push(`O combo "${i.nome}" não tem partes.`);
      i.slots.forEach((s) => !c.itens.some((x) => x.id === s.itemId) && avisos.push(`O combo "${i.nome}" usa um produto que não existe mais.`));
    }
  });
  return avisos;
}

async function publicarCardapio() {
  const avisos = validarCardapio(estado.rascunho);
  if (avisos.length && !confirm(`Atenção:\n- ${avisos.join('\n- ')}\n\nPublicar mesmo assim?`)) return;

  const btn = $('#btn-publicar');
  btn.disabled = true;
  btn.textContent = '⏳ Publicando…';
  const c = clonar(estado.rascunho);
  c.versao = (Number(estado.cardapio.versao) || 0) + 1;
  c.atualizadoEm = new Date().toISOString();
  try {
    await Ntfy.publicar(CONFIG.topicoCardapio, 'cardapio', c);
    estado.cardapio = c;
    estado.rascunho = clonar(c);
    Armazenamento.salvar('cardapio', c);
    Armazenamento.salvar('publicadoEm', Date.now());
    salvarRascunho();
    mostrarAviso('✅ Cardápio publicado para todos os clientes!');
  } catch (e) {
    console.error(e);
    alert('Não foi possível publicar (sem internet?). Suas alterações continuam salvas neste tablet; tente de novo.');
  } finally {
    btn.disabled = false;
    btn.textContent = '📡 Publicar Atualização em Tempo Real';
  }
}

/** Republica o cardápio publicado se a última publicação estiver ficando velha no ntfy. */
async function republicarSeNecessario() {
  const ultima = Armazenamento.ler('publicadoEm', 0);
  if (Date.now() - ultima < CONFIG.republicarCardapioACadaHoras * 3600 * 1000) return;
  try {
    await Ntfy.publicar(CONFIG.topicoCardapio, 'cardapio', estado.cardapio);
    Armazenamento.salvar('publicadoEm', Date.now());
  } catch (e) {
    console.warn('Republicação automática falhou; tentará de novo.', e);
  }
}

function exportarCardapio() {
  const blob = new Blob([JSON.stringify(estado.rascunho, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cardapio-${CONFIG.lojaId}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importarCardapio(e) {
  const arquivo = e.target.files[0];
  e.target.value = '';
  if (!arquivo) return;
  try {
    const c = Cardapio.normalizar(JSON.parse(await arquivo.text()));
    if (!confirm(`Importar cardápio com ${c.categorias.length} categorias e ${c.itens.length} itens? O rascunho atual será substituído.`)) return;
    estado.rascunho = c;
    renderEditor();
    mostrarAviso('Cardápio importado. Confira e clique em Publicar.');
  } catch (err) {
    alert('Arquivo inválido: ' + err.message);
  }
}

function restaurarPadrao() {
  if (!confirm('Substituir o rascunho pelo cardápio inicial de fábrica? (Só vale para os clientes depois de Publicar.)')) return;
  estado.rascunho = Cardapio.normalizar(clonar(CARDAPIO_SEED));
  renderEditor();
}

/* ====================== GERAL ====================== */

let _timerAviso;
function mostrarAviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(_timerAviso);
  _timerAviso = setTimeout(() => (el.hidden = true), 3500);
}

function trocarPainel(nome) {
  sessionStorage.setItem('painel', nome);
  document.querySelectorAll('[data-painel]').forEach((b) => b.classList.toggle('ativa', b.dataset.painel === nome));
  $('#painel-fila').hidden = nome !== 'fila';
  $('#painel-cardapio').hidden = nome !== 'cardapio';
  if (nome === 'cardapio') mostrarEditor();
}

function ligarEventos() {
  $('#btn-loja').addEventListener('click', alternarLoja);
  $('#btn-iniciar').addEventListener('click', iniciarTurno);
  $('#btn-tela').addEventListener('click', () => TelaLigada.alternar());
  $('#btn-tela-cheia').addEventListener('click', alternarTelaCheia);
  $('#btn-atualizar').addEventListener('click', recarregarAgora);
  // Qualquer toque reativa o áudio caso o navegador o suspenda.
  document.addEventListener('pointerdown', () => estado.audio && estado.audio.state === 'suspended' && estado.audio.resume());

  document.querySelectorAll('[data-painel]').forEach((b) => b.addEventListener('click', () => trocarPainel(b.dataset.painel)));

  $('#btn-testar-som').addEventListener('click', () => {
    iniciarAudio();
    bip();
  });
  $('#btn-limpar-historico').addEventListener('click', limparHistorico);
  $('#painel-fila').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset.concluir) mudarStatusPedido(b.dataset.concluir, 'concluido');
    if (b && b.dataset.reabrir) mudarStatusPedido(b.dataset.reabrir, 'pendente');
  });

  $('#btn-pin').addEventListener('click', desbloquearAdmin);
  $('#pin').addEventListener('keydown', (e) => e.key === 'Enter' && ($('#pin2').hidden ? desbloquearAdmin() : $('#pin2').focus()));
  $('#pin2').addEventListener('keydown', (e) => e.key === 'Enter' && desbloquearAdmin());
  $('#btn-trocar-pin').addEventListener('click', trocarPin);
  $('#btn-sair-admin').addEventListener('click', () => {
    sessionStorage.removeItem('adminOk');
    mostrarEditor();
  });

  const ed = $('#lista-editor-itens');
  ed.addEventListener('input', aoEditarCampo);
  ed.addEventListener('change', aoEditarCampo);
  ed.addEventListener('click', aoClicarEditor);
  // Clicar no toggle dentro do <summary> não deve abrir/fechar o cartão.
  ed.addEventListener('click', (e) => e.target.closest('summary .toggle') && e.stopPropagation(), true);

  const cats = $('#lista-categorias');
  cats.addEventListener('input', aoEditarCategoria);
  cats.addEventListener('change', aoEditarCategoria);
  cats.addEventListener('click', aoClicarCategoria);
  $('#btn-nova-categoria').addEventListener('click', novaCategoria);

  $('#btn-publicar').addEventListener('click', publicarCardapio);
  $('#btn-exportar').addEventListener('click', exportarCardapio);
  $('#input-importar').addEventListener('change', importarCardapio);
  $('#btn-restaurar').addEventListener('click', restaurarPadrao);

  // Aviso ao fechar a aba com alterações não publicadas.
  window.addEventListener('beforeunload', (e) => {
    if (!_recarregando && !$('#pendente-publicar').hidden) e.preventDefault();
  });
}
