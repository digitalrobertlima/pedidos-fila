/**
 * ============================================================
 *  cliente.js — APP DO CLIENTE (index.html)
 * ============================================================
 *  Fluxo: nome → escolhe itens/combos na vitrine 3D → carrinho →
 *  pagamento → "Enviar Pedido" → comanda digital na tela.
 *
 *  O cardápio vem, nesta ordem de prioridade:
 *    1. ntfy.sh em tempo real (SSE) — atualiza a tela sozinho
 *    2. última versão retida no ntfy.sh (ao abrir / voltar ao app)
 *    3. última versão salva neste aparelho (localStorage)
 *    4. cardápio inicial (cardapio-seed.js)
 *
 *  Atualização do app: ao detectar versão nova (versao.js), a página
 *  recarrega sozinha. Carrinho, nome e comanda ficam no localStorage,
 *  então nada se perde.
 * ============================================================
 */

const SECAO_PROMO = '__promocoes';

const estado = {
  cardapio: null,
  carrinho: Armazenamento.ler('carrinho', []),
  montagem: null, // item sendo montado no modal
  status: null, // { aberta, validoAte } publicado pelo caixa
  recarregarPendente: false,
};

const $ = (sel) => document.querySelector(sel);
const reduzirMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ====================== INICIALIZAÇÃO ====================== */

document.addEventListener('DOMContentLoaded', async () => {
  aplicarTema();
  $('#slogan').textContent = CONFIG.slogan;
  document.title = `${CONFIG.nomeLoja} — Pedido na Fila`;
  $('#nome-cliente').value = Armazenamento.ler('nomeCliente', '');
  $('#nome-cliente').addEventListener('input', (e) => Armazenamento.salvar('nomeCliente', e.target.value));

  ligarEventos();
  ligarPalco3D();
  App.configurarInstalacao($('#btn-instalar'));
  App.iniciarAtualizacao(atualizarApp);

  // Se há uma comanda aberta (ex: o cliente recarregou a página), mostra ela.
  const comanda = Armazenamento.ler('ultimaComanda');
  if (comanda && comanda.aberta) mostrarComanda(comanda);

  // 1) Mostra imediatamente o que houver localmente (abre instantâneo).
  definirCardapio(Armazenamento.ler('cardapio') || clonar(CARDAPIO_SEED), false);

  // 2) Busca a última versão publicada pelo caixa + status da loja.
  await Promise.all([buscarCardapioDoServidor(), atualizarStatusDoServidor()]);
  setInterval(renderStatusLoja, 20000); // o "aberta" expira sozinho se o caixa sumir

  // 3) Escuta atualizações ao vivo (cardápio e status da loja).
  Ntfy.escutar(
    CONFIG.topicoCardapio,
    (env) => {
      if (env.tipo === 'cardapio') definirCardapio(env.dados, true);
      if (env.tipo === 'status') definirStatus(env.dados);
    },
    { aoStatus: (online) => document.body.classList.toggle('offline', !online) }
  );

  // 4) Ao voltar para o app (estava em segundo plano), confere tudo de novo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      buscarCardapioDoServidor();
      atualizarStatusDoServidor();
    }
  });
});

/** Nova versão do app publicada: recarrega (esperando o cliente terminar de montar um item). */
function atualizarApp() {
  if (document.body.classList.contains('travado')) estado.recarregarPendente = true;
  else location.reload();
}

async function buscarCardapioDoServidor() {
  try {
    const env = await Ntfy.buscarUltima(CONFIG.topicoCardapio, 'cardapio');
    if (env) definirCardapio(env.dados, false);
  } catch (e) {
    console.warn('Sem acesso ao cardápio online, usando o local.', e);
  }
}

/** Troca o cardápio atual e redesenha a vitrine. */
function definirCardapio(novo, avisar) {
  try {
    novo = Cardapio.normalizar(clonar(novo));
  } catch {
    return;
  }
  // Ignora versões mais antigas que a atual.
  if (estado.cardapio && novo.atualizadoEm && estado.cardapio.atualizadoEm && novo.atualizadoEm < estado.cardapio.atualizadoEm) return;
  if (estado.cardapio && JSON.stringify(novo) === JSON.stringify(estado.cardapio)) return;
  estado.cardapio = novo;
  Armazenamento.salvar('cardapio', novo);
  limparCarrinhoIndisponivel();
  renderVitrine();
  renderBarraCarrinho();
  if (avisar) mostrarAviso('✨ Cardápio atualizado');
}

/* ====================== LOJA ABERTA / FECHADA ====================== */

async function atualizarStatusDoServidor() {
  try {
    const env = await Ntfy.buscarUltima(CONFIG.topicoCardapio, 'status');
    definirStatus(env ? env.dados : { aberta: false });
  } catch (e) {
    console.warn('Não foi possível verificar o status da loja.', e);
    definirStatus(estado.status || { aberta: false });
  }
}

function definirStatus(status) {
  estado.status = status;
  renderStatusLoja();
}

function renderStatusLoja() {
  const aberta = lojaEstaAberta(estado.status);
  const faixa = $('#faixa-loja');
  faixa.className = `faixa-loja ${aberta ? 'aberta' : 'fechada'}`;
  faixa.innerHTML = aberta
    ? '<i class="ponto"></i> Loja aberta — monte seu pedido!'
    : '<i class="ponto"></i> Loja fechada — pedidos pela fila pausados';
  const btn = $('#btn-enviar');
  btn.disabled = !aberta;
  btn.textContent = aberta ? 'Enviar Pedido' : 'Loja fechada';
}

/* ====================== VITRINE ====================== */

/** Seções da vitrine: Promoções (se houver) + categorias com itens. */
function secoes() {
  const { categorias, itens } = estado.cardapio;
  const lista = [];
  const promos = itens.filter((i) => i.promocao && Cardapio.disponivel(estado.cardapio, i));
  if (promos.length) lista.push({ id: SECAO_PROMO, nome: 'Promoções', icone: '🔥', itens: promos });
  categorias.forEach((c) => {
    // Dentro da categoria: disponíveis primeiro, promoções no topo.
    const its = itens
      .filter((i) => i.categoriaId === c.id)
      .sort(
        (a, b) =>
          Number(Cardapio.disponivel(estado.cardapio, b)) - Number(Cardapio.disponivel(estado.cardapio, a)) ||
          Number(b.promocao) - Number(a.promocao)
      );
    if (its.length) lista.push({ id: c.id, nome: c.nome, icone: c.icone, itens: its });
  });
  return lista;
}

function cardProduto(item, i) {
  const disp = Cardapio.disponivel(estado.cardapio, item);
  const sabores = item.tipo === 'simples' ? Cardapio.opcoesAtivas(item).map((o) => o.nome).join(' · ') : '';
  return `
  <button class="produto ${item.promocao ? 'promo' : ''} ${disp ? '' : 'indisponivel'}" data-item="${esc(item.id)}" ${disp ? '' : 'disabled'}
    style="--fundo:${fundoItem(item)};--atraso:${(-(i * 0.43) % 3).toFixed(2)}s">
    <div class="palco">
      ${item.promocao ? '<span class="fita">PROMO</span>' : ''}
      <div class="objeto">${svgItem(item, estado.cardapio)}</div>
      <div class="sombra"></div>
      ${disp ? '' : '<span class="esgotado">Esgotado</span>'}
    </div>
    <div class="info">
      <h3>${esc(item.nome)}</h3>
      <p class="sub">${esc(item.descricao || sabores)}</p>
      <div class="linha-preco">
        <strong>${item.preco > 0 ? dinheiro(item.preco) : '—'}</strong>
        ${disp ? '<span class="add" aria-hidden="true">+</span>' : ''}
      </div>
    </div>
  </button>`;
}

function renderVitrine() {
  const lista = secoes();
  $('#abas').innerHTML = lista
    .map((s, i) => `<button class="aba ${i === 0 ? 'ativa' : ''}" data-secao="${esc(s.id)}"><span>${esc(s.icone || '')}</span>${esc(s.nome)}</button>`)
    .join('');
  let n = 0;
  $('#lista-itens').innerHTML =
    lista
      .map(
        (s) => `<section class="secao" id="secao-${esc(s.id)}" data-secao="${esc(s.id)}">
          <h2><span>${esc(s.icone || '')}</span> ${esc(s.nome)}</h2>
          <div class="grade">${s.itens.map((it) => cardProduto(it, n++)).join('')}</div>
        </section>`
      )
      .join('') || '<p class="vazio">Cardápio vazio.</p>';
  observarSecoes();
}

/** Destaca a aba da seção visível enquanto o cliente rola a tela. */
let _observador;
function observarSecoes() {
  if (_observador) _observador.disconnect();
  _observador = new IntersectionObserver(
    (entradas) => {
      const visivel = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visivel) marcarAba(visivel.target.dataset.secao);
    },
    { rootMargin: '-120px 0px -55% 0px' }
  );
  document.querySelectorAll('.secao').forEach((s) => _observador.observe(s));
}

function marcarAba(id) {
  document.querySelectorAll('.aba').forEach((a) => {
    const ativa = a.dataset.secao === id;
    a.classList.toggle('ativa', ativa);
    if (ativa) {
      const nav = $('#abas');
      nav.scrollTo({ left: a.offsetLeft - nav.clientWidth / 2 + a.clientWidth / 2, behavior: 'smooth' });
    }
  });
}

/* ====================== MONTADOR (MODAL COM PALCO 3D) ====================== */

/**
 * montagem.grupos = lista de grupos de escolha. Cada grupo tem:
 *   { titulo, limite (null = livre), fixo, fonte, opcoes: [{id,nome,codigoPdv,qtd}] }
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
        titulo: slot.nome,
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
      fonte: item,
      titulo: ops.length ? 'Escolha os sabores' : 'Quantidade',
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
  $('#mi-palco').style.setProperty('--fundo', fundoItem(item));
  trocarObjeto(svgItem(item, estado.cardapio), false);
  renderMontador();
  abrirModal('#modal-item');
  $('#modal-item .folha').scrollTop = 0;
}

/** Troca o produto no palco 3D (com um "pulinho"). */
function trocarObjeto(html, animar = true) {
  const obj = $('#mi-objeto');
  obj.innerHTML = html;
  if (animar && !reduzirMovimento) obj.animate([{ transform: 'scale(.82)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
}

function renderMontador() {
  const { item, grupos } = estado.montagem;
  $('#mi-corpo').innerHTML = grupos
    .map((g, gi) => {
      const soma = g.opcoes.reduce((s, o) => s + o.qtd, 0);
      const progresso = g.limite
        ? `<div class="progresso ${soma === g.limite ? 'ok' : ''}"><i style="width:${(soma / g.limite) * 100}%"></i></div>`
        : '';
      const contador = g.limite ? `<span class="contador ${soma === g.limite ? 'ok' : ''}">${soma === g.limite ? '✓ ' : ''}${soma}/${g.limite}</span>` : '';

      if (g.fixo) {
        return `<section class="grupo"><h3>${esc(g.slot.nome)} <span class="contador ok">✓ incluso</span></h3>
          <div class="opcao marcada"><span class="mini" style="--fundo:${fundoItem(g.fonte)}">${svgItem(g.fonte, estado.cardapio, '')}</span><span class="nome">${g.limite}x ${esc(g.fonte.nome)}</span></div></section>`;
      }
      const semSabor = g.opcoes.length === 1 && !g.opcoes[0].nome;
      const linhas = g.opcoes
        .map((o, oi) => {
          const cheio = g.limite && soma >= g.limite;
          return `<div class="opcao ${o.qtd > 0 ? 'marcada' : ''} ${semSabor ? 'unica' : ''}">
            ${semSabor ? '' : `<span class="mini" style="--fundo:${fundoItem(g.fonte, o.nome)}">${svgItem(g.fonte, estado.cardapio, o.nome)}</span><span class="nome">${esc(o.nome)}</span>`}
            <div class="stepper">
              <button data-passo="-1" data-g="${gi}" data-o="${oi}" ${o.qtd <= 0 ? 'disabled' : ''} aria-label="Menos">−</button>
              <output>${o.qtd}</output>
              <button data-passo="1" data-g="${gi}" data-o="${oi}" ${cheio ? 'disabled' : ''} aria-label="Mais">+</button>
            </div>
          </div>`;
        })
        .join('');
      return `<section class="grupo"><h3>${esc(g.titulo)} ${contador}</h3>${progresso}${linhas}</section>`;
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
  btn.textContent = valido ? `Adicionar à sacola · ${dinheiro(preco)}` : item.tipo === 'combo' ? 'Complete as escolhas' : 'Escolha ao menos 1';
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
  voarParaSacola();
  salvarCarrinho();
  fecharModais();
  mostrarAviso(`✅ ${item.nome} na sacola`);
}

/** Animação: o produto "voa" do palco até a barra da sacola. */
function voarParaSacola() {
  if (reduzirMovimento) return;
  const origem = $('#mi-objeto').getBoundingClientRect();
  const barra = $('#barra-carrinho');
  barra.hidden = false;
  const destino = barra.getBoundingClientRect();
  const clone = $('#mi-objeto').cloneNode(true);
  clone.removeAttribute('id');
  Object.assign(clone.style, { position: 'fixed', left: `${origem.left}px`, top: `${origem.top}px`, width: `${origem.width}px`, height: `${origem.height}px`, zIndex: 60, pointerEvents: 'none' });
  document.body.appendChild(clone);
  const dx = destino.left + 30 - (origem.left + origem.width / 2);
  const dy = destino.top + destino.height / 2 - (origem.top + origem.height / 2);
  clone
    .animate(
      [
        { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.3 - 80}px) scale(.6) rotate(-15deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(.12) rotate(-30deg)`, opacity: 0.4 },
      ],
      { duration: 650, easing: 'cubic-bezier(.5,0,.3,1)' }
    )
    .finished.then(() => {
      clone.remove();
      barra.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 300 });
    });
}

/* ---------- Palco 3D: arrastar para girar (e inclinar o celular no Android) ---------- */

function ligarPalco3D() {
  const palco = $('#mi-palco');
  const giro = palco.querySelector('.giro');
  let inicio = null;

  palco.addEventListener('pointerdown', (e) => {
    inicio = { x: e.clientX, y: e.clientY };
    palco.classList.add('girando');
    palco.setPointerCapture(e.pointerId);
  });
  palco.addEventListener('pointermove', (e) => {
    if (!inicio) return;
    const ry = Math.max(-55, Math.min(55, (e.clientX - inicio.x) * 0.5));
    const rx = Math.max(-25, Math.min(25, -(e.clientY - inicio.y) * 0.3));
    giro.style.transform = `rotateY(${ry}deg) rotateX(${rx}deg)`;
  });
  const soltar = () => {
    if (!inicio) return;
    inicio = null;
    giro.style.transform = '';
    palco.classList.remove('girando');
  };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);

  // Inclinação do aparelho (Android). No iPhone exigiria permissão, então fica só o arrastar.
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function' && !reduzirMovimento) {
    window.addEventListener('deviceorientation', (e) => {
      if (inicio || $('#modal-item').hidden || e.gamma === null) return;
      palco.style.setProperty('--incl-y', `${Math.max(-20, Math.min(20, e.gamma * 0.6))}deg`);
      palco.style.setProperty('--incl-x', `${Math.max(-12, Math.min(12, (e.beta - 45) * -0.3))}deg`);
    });
  }
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
  $('#carrinho-qtd').textContent = qtd;
  $('#carrinho-total').textContent = dinheiro(totalCarrinho());
}

function renderCarrinho() {
  $('#carrinho-lista').innerHTML =
    estado.carrinho
      .map((l, i) => {
        const item = Cardapio.item(estado.cardapio, l.itemId);
        const thumb = item ? svgItem(item, estado.cardapio, l.tipo === 'combo' ? undefined : l.sabor || '') : '';
        const detalhe =
          l.tipo === 'combo' ? l.partes.map((p) => p.sabores.map((s) => `${s.qtd}x ${s.nome || p.itemNome}`).join(', ')).join(' + ') : l.sabor || '';
        return `<li>
          <span class="mini" style="--fundo:${item ? fundoItem(item, l.sabor) : '#eee'}">${thumb}</span>
          <div class="txt"><strong>${l.qtd}x ${esc(l.nome)}</strong><small>${esc(detalhe)}</small></div>
          <div class="dir"><span>${dinheiro(l.preco * l.qtd)}</span>
          <button class="remover" data-remover="${i}" aria-label="Remover">🗑</button></div>
        </li>`;
      })
      .join('') || '<li class="vazio">Sua sacola está vazia</li>';
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

  if (!estado.carrinho.length) return erroEnvio('Sua sacola está vazia.');
  if (!nome) {
    fecharModais();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('#nome-cliente').focus();
    $('#nome-cliente').classList.add('invalido');
    return mostrarAviso('Digite seu nome para enviar o pedido.');
  }
  if (!pagamento) return erroEnvio('Escolha a forma de pagamento.');
  const total = totalCarrinho();
  if (pagamento === 'dinheiro' && troco && troco < total) return erroEnvio('O valor para troco é menor que o total.');

  // Confere de novo no servidor se o caixa está aberto antes de enviar.
  const btn = $('#btn-enviar');
  btn.disabled = true;
  btn.textContent = 'Verificando…';
  await atualizarStatusDoServidor();
  if (!lojaEstaAberta(estado.status)) return erroEnvio('A loja está fechada agora. Faça o pedido direto no balcão.');
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
  renderStatusLoja();
  if (estado.recarregarPendente) setTimeout(() => location.reload(), 700);
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
    const b = e.target.closest('[data-secao]');
    if (!b) return;
    const alvo = document.getElementById(`secao-${b.dataset.secao}`);
    const topo = alvo.getBoundingClientRect().top + window.scrollY - $('#abas').offsetHeight - 8;
    window.scrollTo({ top: topo, behavior: 'smooth' });
    marcarAba(b.dataset.secao);
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
    // Item simples com sabores: o palco mostra o sabor que acabou de ser escolhido.
    if (passo > 0 && o.nome && estado.montagem.item.tipo === 'simples') {
      const it = estado.montagem.item;
      $('#mi-palco').style.setProperty('--fundo', fundoItem(it, o.nome));
      trocarObjeto(svgItem(it, estado.cardapio, o.nome));
    }
    if (navigator.vibrate) navigator.vibrate(8);
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
