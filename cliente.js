/**
 * ============================================================
 *  cliente.js — APP DO CLIENTE (index.html)
 * ============================================================
 *  Fluxo: nome → escolhe itens/combos → carrinho → pagamento →
 *  "Enviar Pedido" → comanda digital na tela.
 *
 *  O cardápio vem, nesta ordem de prioridade:
 *    1. ntfy.sh em tempo real (SSE) — atualiza a tela sozinho
 *    2. última versão retida no ntfy.sh (ao abrir o app)
 *    3. última versão salva neste aparelho (localStorage)
 *    4. cardápio inicial (cardapio-seed.js)
 * ============================================================
 */

const ABA_PROMO = '__promocoes';

const estado = {
  cardapio: null,
  aba: null,
  carrinho: Armazenamento.ler('carrinho', []),
  montagem: null, // item sendo montado no modal
};

const $ = (sel) => document.querySelector(sel);

/* ====================== INICIALIZAÇÃO ====================== */

document.addEventListener('DOMContentLoaded', async () => {
  aplicarTema();
  $('#slogan').textContent = CONFIG.slogan;
  document.title = `${CONFIG.nomeLoja} — Pedido na Fila`;
  $('#nome-cliente').value = Armazenamento.ler('nomeCliente', '');
  $('#nome-cliente').addEventListener('input', (e) => Armazenamento.salvar('nomeCliente', e.target.value));

  ligarEventos();

  // Se há uma comanda aberta (ex: o cliente recarregou a página), mostra ela.
  const comanda = Armazenamento.ler('ultimaComanda');
  if (comanda && comanda.aberta) mostrarComanda(comanda);

  // 1) Mostra imediatamente o que houver localmente (abre instantâneo).
  definirCardapio(Armazenamento.ler('cardapio') || clonar(CARDAPIO_SEED), false);

  // 2) Busca a última versão publicada pelo caixa.
  try {
    const env = await Ntfy.buscarUltima(CONFIG.topicoCardapio, 'cardapio');
    if (env) definirCardapio(env.dados, false);
  } catch (e) {
    console.warn('Sem acesso ao cardápio online, usando o local.', e);
  }

  // 3) Escuta atualizações ao vivo.
  Ntfy.escutar(
    CONFIG.topicoCardapio,
    (env) => env.tipo === 'cardapio' && definirCardapio(env.dados, true),
    { aoStatus: (online) => $('#status-cardapio').classList.toggle('online', online) }
  );

  registrarServiceWorker();
});

/** Troca o cardápio atual e redesenha a tela. */
function definirCardapio(novo, avisar) {
  try {
    novo = Cardapio.normalizar(clonar(novo));
  } catch {
    return;
  }
  // Ignora versões mais antigas que a atual.
  if (estado.cardapio && novo.atualizadoEm && estado.cardapio.atualizadoEm && novo.atualizadoEm < estado.cardapio.atualizadoEm) return;
  estado.cardapio = novo;
  Armazenamento.salvar('cardapio', novo);
  limparCarrinhoIndisponivel();
  renderAbas();
  renderItens();
  renderBarraCarrinho();
  if (avisar) mostrarAviso('Cardápio atualizado');
}

/* ====================== ABAS E LISTA ====================== */

/** Itens visíveis de uma aba (promoções sobem para o topo). */
function itensDaAba(aba) {
  const itens = estado.cardapio.itens;
  const lista = aba === ABA_PROMO ? itens.filter((i) => i.promocao) : itens.filter((i) => i.categoriaId === aba);
  return lista.sort((a, b) => Number(b.promocao) - Number(a.promocao));
}

function renderAbas() {
  const { categorias, itens } = estado.cardapio;
  const abas = [];
  if (itens.some((i) => i.promocao && Cardapio.disponivel(estado.cardapio, i))) abas.push({ id: ABA_PROMO, nome: '🔥 Promoções' });
  categorias.forEach((c) => itens.some((i) => i.categoriaId === c.id) && abas.push(c));

  if (!abas.some((a) => a.id === estado.aba)) estado.aba = abas[0] && abas[0].id;

  $('#abas').innerHTML = abas
    .map((a) => `<button class="aba ${a.id === estado.aba ? 'ativa' : ''}" data-aba="${esc(a.id)}">${esc(a.nome)}</button>`)
    .join('');
}

function renderItens() {
  const lista = estado.aba ? itensDaAba(estado.aba) : [];
  if (!lista.length) {
    $('#lista-itens').innerHTML = '<p class="vazio">Nenhum item nesta categoria.</p>';
    return;
  }
  $('#lista-itens').innerHTML = lista
    .map((item) => {
      const disp = Cardapio.disponivel(estado.cardapio, item);
      const sabores = item.tipo === 'simples' ? Cardapio.opcoesAtivas(item).map((o) => o.nome).join(', ') : '';
      return `
      <button class="card-item ${item.promocao ? 'promo' : ''} ${disp ? '' : 'indisponivel'}" data-item="${esc(item.id)}" ${disp ? '' : 'disabled'}>
        <div class="card-info">
          ${item.promocao ? '<span class="selo">PROMOÇÃO</span>' : ''}
          <h3>${esc(item.nome)}</h3>
          <p class="sub">${esc(item.descricao || sabores)}</p>
        </div>
        <div class="card-preco">
          ${disp ? `<strong>${dinheiro(item.preco)}</strong><span class="mais">+</span>` : '<span class="tag-off">Indisponível</span>'}
        </div>
      </button>`;
    })
    .join('');
}

/* ====================== MONTADOR (MODAL) ====================== */

/**
 * Abre o modal de montagem.
 * montagem.grupos = lista de grupos de escolha. Cada grupo tem:
 *   { titulo, limite (null = livre), opcoes: [{id,nome,codigoPdv,qtd}], fixo }
 */
function abrirMontador(itemId) {
  const item = Cardapio.item(estado.cardapio, itemId);
  if (!item || !Cardapio.disponivel(estado.cardapio, item)) return;

  const grupos = [];
  if (item.tipo === 'combo') {
    item.slots.forEach((slot) => {
      const fonte = Cardapio.item(estado.cardapio, slot.itemId);
      const ops = Cardapio.opcoesAtivas(fonte);
      grupos.push({
        slot,
        fonte,
        titulo: `${slot.nome} — escolha ${slot.quantidade}`,
        limite: slot.quantidade,
        fixo: ops.length === 0, // sem sabores: vem automático
        opcoes: ops.length
          ? ops.map((o) => ({ id: o.id, nome: o.nome, codigoPdv: o.codigoPdv || fonte.codigoPdv, qtd: 0 }))
          : [{ id: fonte.id, nome: '', codigoPdv: fonte.codigoPdv, qtd: slot.quantidade }],
      });
    });
  } else {
    const ops = Cardapio.opcoesAtivas(item);
    grupos.push({
      titulo: ops.length ? 'Escolha os sabores e quantidades' : 'Quantidade',
      limite: null,
      fixo: false,
      opcoes: ops.length
        ? ops.map((o) => ({ id: o.id, nome: o.nome, codigoPdv: o.codigoPdv || item.codigoPdv, qtd: 0 }))
        : [{ id: item.id, nome: '', codigoPdv: item.codigoPdv, qtd: 1 }],
    });
  }

  estado.montagem = { item, grupos };
  $('#mi-nome').textContent = item.nome;
  $('#mi-desc').textContent = `${item.descricao ? item.descricao + ' · ' : ''}${dinheiro(item.preco)}${item.tipo === 'simples' ? ' cada' : ''}`;
  renderMontador();
  abrirModal('#modal-item');
}

function renderMontador() {
  const { item, grupos } = estado.montagem;
  $('#mi-corpo').innerHTML = grupos
    .map((g, gi) => {
      const soma = g.opcoes.reduce((s, o) => s + o.qtd, 0);
      const contador = g.limite ? `<span class="contador ${soma === g.limite ? 'ok' : ''}">${soma}/${g.limite}</span>` : '';
      if (g.fixo) {
        return `<section class="grupo"><h3>${esc(g.slot.nome)} ${contador}</h3><p class="fixo">✓ ${g.limite}x ${esc(g.fonte.nome)} (incluso)</p></section>`;
      }
      const linhas = g.opcoes
        .map((o, oi) => {
          const cheio = g.limite && soma >= g.limite;
          return `<div class="stepper-linha">
            <span>${esc(o.nome || item.nome)}</span>
            <div class="stepper">
              <button data-passo="-1" data-g="${gi}" data-o="${oi}" ${o.qtd <= 0 ? 'disabled' : ''} aria-label="Menos">−</button>
              <output>${o.qtd}</output>
              <button data-passo="1" data-g="${gi}" data-o="${oi}" ${cheio ? 'disabled' : ''} aria-label="Mais">+</button>
            </div>
          </div>`;
        })
        .join('');
      return `<section class="grupo"><h3>${esc(g.titulo)} ${contador}</h3>${linhas}</section>`;
    })
    .join('');

  // Validação do botão Adicionar
  let valido;
  let preco;
  if (item.tipo === 'combo') {
    valido = grupos.every((g) => g.opcoes.reduce((s, o) => s + o.qtd, 0) === g.limite);
    preco = item.preco;
  } else {
    const total = grupos[0].opcoes.reduce((s, o) => s + o.qtd, 0);
    valido = total > 0;
    preco = item.preco * total;
  }
  const btn = $('#mi-adicionar');
  btn.disabled = !valido;
  btn.textContent = valido ? `Adicionar · ${dinheiro(preco)}` : item.tipo === 'combo' ? 'Complete as escolhas' : 'Escolha ao menos 1';
}

/** Confirma o montador e coloca no carrinho. */
function adicionarMontagem() {
  const { item, grupos } = estado.montagem;
  if (item.tipo === 'combo') {
    estado.carrinho.push({
      chave: gerarId('c'),
      tipo: 'combo',
      itemId: item.id,
      nome: item.nome,
      codigoPdv: item.codigoPdv,
      preco: item.preco,
      qtd: 1,
      partes: grupos.map((g) => ({
        slotNome: g.slot.nome,
        itemNome: g.fonte.nome,
        sabores: g.opcoes.filter((o) => o.qtd > 0).map((o) => ({ nome: o.nome, codigoPdv: o.codigoPdv, qtd: o.qtd })),
      })),
    });
  } else {
    // Uma linha por sabor; junta com linha igual já existente.
    grupos[0].opcoes
      .filter((o) => o.qtd > 0)
      .forEach((o) => {
        const chave = `${item.id}|${o.id}`;
        const existente = estado.carrinho.find((l) => l.chave === chave);
        if (existente) existente.qtd += o.qtd;
        else
          estado.carrinho.push({ chave, tipo: 'simples', itemId: item.id, opcaoId: o.id, nome: item.nome, sabor: o.nome, codigoPdv: o.codigoPdv, preco: item.preco, qtd: o.qtd });
      });
  }
  salvarCarrinho();
  fecharModais();
  mostrarAviso(`${item.nome} adicionado`);
}

/* ====================== CARRINHO ====================== */

function totalCarrinho() {
  return estado.carrinho.reduce((s, l) => s + l.preco * l.qtd, 0);
}

function salvarCarrinho() {
  Armazenamento.salvar('carrinho', estado.carrinho);
  renderBarraCarrinho();
  renderCarrinho();
}

/** Remove do carrinho itens que ficaram indisponíveis e atualiza preços. */
function limparCarrinhoIndisponivel() {
  const antes = estado.carrinho.length;
  estado.carrinho = estado.carrinho.filter((l) => {
    const item = Cardapio.item(estado.cardapio, l.itemId);
    if (!item || !Cardapio.disponivel(estado.cardapio, item)) return false;
    if (l.tipo === 'simples' && item.opcoes.length && !Cardapio.opcoesAtivas(item).some((o) => o.id === l.opcaoId)) return false;
    l.preco = item.preco;
    return true;
  });
  if (estado.carrinho.length < antes) mostrarAviso('Algum item do seu pedido esgotou e foi removido.');
  Armazenamento.salvar('carrinho', estado.carrinho);
}

function renderBarraCarrinho() {
  const qtd = estado.carrinho.reduce((s, l) => s + l.qtd, 0);
  $('#barra-carrinho').hidden = qtd === 0;
  $('#carrinho-qtd').textContent = `${qtd} ${qtd === 1 ? 'item' : 'itens'}`;
  $('#carrinho-total').textContent = dinheiro(totalCarrinho());
}

function renderCarrinho() {
  $('#carrinho-lista').innerHTML =
    estado.carrinho
      .map((l, i) => {
        const detalhe =
          l.tipo === 'combo'
            ? l.partes.map((p) => p.sabores.map((s) => `${s.qtd}x ${s.nome || p.itemNome}`).join(', ')).join(' + ')
            : esc(l.sabor || '');
        return `<li>
          <div><strong>${l.qtd}x ${esc(l.nome)}</strong><small>${esc(detalhe)}</small></div>
          <div class="dir"><span>${dinheiro(l.preco * l.qtd)}</span>
          <button class="remover" data-remover="${i}" aria-label="Remover">🗑</button></div>
        </li>`;
      })
      .join('') || '<li class="vazio">Carrinho vazio</li>';
  $('#cf-total').textContent = dinheiro(totalCarrinho());
}

/* ====================== ENVIO DO PEDIDO ====================== */

/** Número curto do pedido, ex: P-482 (3 dígitos aleatórios). */
function gerarNumeroPedido() {
  return `P-${Math.floor(100 + Math.random() * 900)}`;
}

function erroEnvio(msg) {
  const el = $('#erro-envio');
  el.textContent = msg;
  el.hidden = !msg;
}

async function enviarPedido() {
  const nome = $('#nome-cliente').value.trim();
  const pagamento = (document.querySelector('input[name="pagamento"]:checked') || {}).value;
  const troco = parseFloat($('#troco').value);

  if (!estado.carrinho.length) return erroEnvio('Seu carrinho está vazio.');
  if (!nome) {
    fecharModais();
    $('#nome-cliente').focus();
    $('#nome-cliente').classList.add('invalido');
    return mostrarAviso('Digite seu nome para enviar o pedido.');
  }
  if (!pagamento) return erroEnvio('Escolha a forma de pagamento.');
  const total = totalCarrinho();
  if (pagamento === 'dinheiro' && troco && troco < total) return erroEnvio('O valor para troco é menor que o total.');
  erroEnvio('');

  const pedido = {
    uid: gerarId('ped'),
    numero: gerarNumeroPedido(),
    nome,
    pagamento,
    trocoPara: pagamento === 'dinheiro' && troco ? troco : null,
    itens: estado.carrinho.map(({ chave, ...resto }) => resto),
    total,
    criadoEm: new Date().toISOString(),
  };

  // A comanda aparece IMEDIATAMENTE (funciona mesmo se a internet falhar).
  const comanda = { pedido, aberta: true, status: 'enviando' };
  Armazenamento.salvar('ultimaComanda', comanda);
  estado.carrinho = [];
  salvarCarrinho();
  fecharModais();
  mostrarComanda(comanda);
  await transmitir(comanda);
}

/** Envia o pedido ao tablet do caixa via ntfy.sh. */
async function transmitir(comanda) {
  comanda.status = 'enviando';
  atualizarStatusComanda(comanda);
  try {
    await Ntfy.publicar(CONFIG.topicoPedidos, 'pedido', comanda.pedido);
    comanda.status = 'enviado';
  } catch (e) {
    console.error(e);
    comanda.status = 'falhou';
  }
  Armazenamento.salvar('ultimaComanda', comanda);
  atualizarStatusComanda(comanda);
}

/* ====================== COMANDA DIGITAL ====================== */

function mostrarComanda(comanda) {
  const p = comanda.pedido;
  $('#cd-numero').textContent = `#${p.numero}`;
  $('#cd-nome').textContent = p.nome;
  $('#cd-pagamento').textContent = textoPagamento(p);
  $('#cd-hora').textContent = new Date(p.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('#cd-itens').innerHTML = htmlItensPedido(p.itens);
  $('#cd-total').textContent = dinheiro(p.total);
  atualizarStatusComanda(comanda);
  $('#tela-pedido').hidden = true;
  $('#tela-comanda').hidden = false;
  window.scrollTo(0, 0);
}

function atualizarStatusComanda(comanda) {
  const textos = {
    enviando: '⏳ Enviando para o caixa…',
    enviado: '✅ Pedido recebido pelo sistema',
    falhou: '⚠️ Sem conexão — mostre esta tela no balcão',
  };
  const el = $('#cd-status');
  el.textContent = textos[comanda.status] || '';
  el.className = `comanda-status ${comanda.status}`;
  $('#btn-reenviar').hidden = comanda.status !== 'falhou';
}

function novoPedido() {
  const comanda = Armazenamento.ler('ultimaComanda');
  if (comanda && comanda.status !== 'enviado' && !confirm('Este pedido ainda não chegou ao caixa. Deseja mesmo fazer um novo?')) return;
  if (comanda) {
    comanda.aberta = false;
    Armazenamento.salvar('ultimaComanda', comanda);
  }
  document.querySelectorAll('input[name="pagamento"]').forEach((r) => (r.checked = false));
  $('#troco').value = '';
  $('#campo-troco').hidden = true;
  $('#tela-comanda').hidden = true;
  $('#tela-pedido').hidden = false;
}

/* ====================== MODAIS E AVISOS ====================== */

function abrirModal(sel) {
  $(sel).hidden = false;
  document.body.classList.add('travado');
}

function fecharModais() {
  document.querySelectorAll('.modal').forEach((m) => (m.hidden = true));
  document.body.classList.remove('travado');
}

let _timerAviso;
function mostrarAviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(_timerAviso);
  _timerAviso = setTimeout(() => (el.hidden = true), 2500);
}

/* ====================== EVENTOS ====================== */

function ligarEventos() {
  $('#abas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-aba]');
    if (!b) return;
    estado.aba = b.dataset.aba;
    renderAbas();
    renderItens();
  });

  $('#lista-itens').addEventListener('click', (e) => {
    const b = e.target.closest('[data-item]');
    if (b) abrirMontador(b.dataset.item);
  });

  $('#mi-corpo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-passo]');
    if (!b) return;
    const g = estado.montagem.grupos[b.dataset.g];
    const o = g.opcoes[b.dataset.o];
    const soma = g.opcoes.reduce((s, x) => s + x.qtd, 0);
    const passo = Number(b.dataset.passo);
    if (passo > 0 && g.limite && soma >= g.limite) return;
    o.qtd = Math.max(0, o.qtd + passo);
    renderMontador();
  });

  $('#mi-adicionar').addEventListener('click', adicionarMontagem);

  $('#barra-carrinho').addEventListener('click', () => {
    renderCarrinho();
    erroEnvio('');
    abrirModal('#modal-carrinho');
  });

  $('#carrinho-lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remover]');
    if (!b) return;
    estado.carrinho.splice(Number(b.dataset.remover), 1);
    salvarCarrinho();
    if (!estado.carrinho.length) fecharModais();
  });

  document.querySelectorAll('input[name="pagamento"]').forEach((r) =>
    r.addEventListener('change', () => ($('#campo-troco').hidden = r.value !== 'dinheiro' || !r.checked))
  );

  $('#nome-cliente').addEventListener('input', (e) => e.target.classList.remove('invalido'));
  $('#btn-enviar').addEventListener('click', enviarPedido);
  $('#btn-reenviar').addEventListener('click', () => transmitir(Armazenamento.ler('ultimaComanda')));
  $('#btn-novo').addEventListener('click', novoPedido);

  // Fechar modais: botão ✕ ou toque no fundo escuro.
  document.querySelectorAll('.modal').forEach((m) =>
    m.addEventListener('click', (e) => {
      if (e.target === m || e.target.closest('[data-fechar]')) fecharModais();
    })
  );
}

/* ====================== PWA ====================== */

function registrarServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
