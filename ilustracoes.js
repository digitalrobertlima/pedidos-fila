/**
 * ============================================================
 *  ilustracoes.js — PRODUTOS EM "3D" (SVG vetorial, sem imagens)
 * ============================================================
 *  Cada produto é desenhado com gradientes, brilhos e sombras para
 *  parecer volumétrico. É leve (alguns KB), nítido em qualquer tela
 *  e funciona offline. A cor muda conforme o sabor escolhido
 *  (ex: lata vermelha para cola, laranja para Fanta Laranja).
 *
 *  Tipos de ilustração (campo `ilustracao` do item no cardápio):
 *    pastel, salgado, caldo, cafe, cafe-leite, suco, refresco,
 *    lata, garrafa, agua, combo, generico
 *  Se o item tiver o campo `imagem` (URL de foto), a foto é usada.
 *
 *  Obs.: nenhuma marca/logotipo é desenhado — apenas cores.
 * ============================================================
 */

const ILUSTRACOES = [
  ['pastel', 'Pastel'],
  ['salgado', 'Coxinha / Quibe'],
  ['caldo', 'Caldo de cana'],
  ['cafe', 'Cafezinho (xícara)'],
  ['cafe-leite', 'Café com leite (copo)'],
  ['suco', 'Suco natural'],
  ['refresco', 'Refresco (com gelo)'],
  ['lata', 'Refrigerante lata'],
  ['garrafa', 'Refrigerante garrafa'],
  ['agua', 'Água'],
  ['combo', 'Combo (monta sozinho)'],
  ['generico', 'Genérico (prato)'],
];

/* ---------------------- Cores ---------------------- */

let _ilusId = 0;
const _uid = () => `il${++_ilusId}`;

function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function _rgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mistura duas cores hex (t=0 → a, t=1 → b). */
function misturar(a, b, t) {
  const A = _rgb(a);
  const B = _rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const clarear = (c, t) => misturar(c, '#ffffff', t);
const escurecer = (c, t) => misturar(c, '#000000', t);

/** Cor "de marca" do sabor (rótulo, recheio, fruta). Ordem importa: "zero" antes de "coca". */
const _CORES_SABOR = [
  [/zero/, '#1c1c1c'],
  [/coca|cola/, '#d7141a'],
  [/uva/, '#6b2d8f'],
  [/guarana|kuat/, '#2e9e3e'],
  [/sprite|limao|lima/, '#33b36b'],
  [/limonada/, '#a8d65a'],
  [/laranja/, '#ff8a00'],
  [/caju/, '#f08a3c'],
  [/maracuja/, '#f2c12e'],
  [/morango/, '#e23d5b'],
  [/carne/, '#8b4a2b'],
  [/queijo/, '#ffcf3f'],
  [/frango/, '#e9b872'],
  [/napolitano|pizza/, '#e84a3c'],
  [/banana/, '#ffe066'],
  [/chocolate/, '#5a3320'],
  [/palmito/, '#e8e3b0'],
  [/coxinha/, '#e0892b'],
  [/quibe|kibe/, '#8a5a2b'],
];
function corSabor(nome, padrao = '#e85d04') {
  const n = semAcento(nome);
  for (const [re, c] of _CORES_SABOR) if (re.test(n)) return c;
  return padrao;
}

/** Cor do líquido dentro da embalagem. */
const _LIQUIDOS = [
  [/zero|coca|cola/, '#3a1c10'],
  [/uva/, '#5a1f6e'],
  [/guarana|kuat/, '#c98a1d'],
  [/sprite|limao/, '#e2f4cf'],
  [/limonada/, '#e4f3bd'],
  [/laranja/, '#ff9a1f'],
  [/caju/, '#f7a24b'],
  [/maracuja/, '#f6c838'],
  [/morango/, '#ef5b78'],
];
function corLiquido(nome, padrao) {
  const n = semAcento(nome);
  for (const [re, c] of _LIQUIDOS) if (re.test(n)) return c;
  return padrao;
}

/* ---------------------- Desenhos (viewBox 0 0 200 200) ---------------------- */

function _pastel(o = {}) {
  const id = _uid();
  const chip = o.sabor ? corSabor(o.sabor, null) : null;
  const bolhas = [[58, 92, 5], [84, 120, 4], [118, 86, 6], [140, 118, 4], [100, 104, 3], [150, 92, 3], [66, 124, 3]]
    .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.75}" fill="#fff4cf" opacity=".6"/><ellipse cx="${x + 1}" cy="${y + 1.5}" rx="${r}" ry="${r * 0.6}" fill="#b8641a" opacity=".25"/>`)
    .join('');
  return `<defs>
    <radialGradient id="${id}a" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#ffe7a3"/><stop offset=".5" stop-color="#f4b445"/><stop offset="1" stop-color="#c7711b"/></radialGradient>
    <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c26c19"/><stop offset="1" stop-color="#8f4a10"/></linearGradient>
  </defs>
  <g transform="rotate(-9 100 108)">
    <rect x="20" y="66" width="160" height="92" rx="36" fill="url(#${id}b)"/>
    <rect x="20" y="56" width="160" height="92" rx="36" fill="url(#${id}a)"/>
    <rect x="31" y="66" width="138" height="72" rx="27" fill="none" stroke="#b9661a" stroke-width="3.2" stroke-dasharray="1 7.5" stroke-linecap="round" opacity=".85"/>
    ${bolhas}
    <ellipse cx="74" cy="74" rx="38" ry="9" fill="#fff" opacity=".38"/>
    ${chip ? `<circle cx="156" cy="66" r="15" fill="${chip}" stroke="#fff" stroke-width="5"/><circle cx="151" cy="61" r="4" fill="#fff" opacity=".5"/>` : ''}
  </g>`;
}

function _coxinha() {
  const id = _uid();
  const migalhas = [[88, 80], [112, 92], [76, 118], [124, 128], [100, 140], [92, 104], [130, 108], [68, 140], [110, 156], [84, 156], [140, 146]]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${2 + (i % 3)}" fill="${i % 2 ? '#fbd08a' : '#a8551a'}" opacity=".7"/>`)
    .join('');
  return `<defs><radialGradient id="${id}" cx="38%" cy="35%" r="75%"><stop offset="0" stop-color="#ffcf7e"/><stop offset=".55" stop-color="#e48c2c"/><stop offset="1" stop-color="#a5521a"/></radialGradient></defs>
  <path d="M100 30 C112 50 152 96 152 128 C152 160 128 174 100 174 C72 174 48 160 48 128 C48 96 88 50 100 30Z" fill="url(#${id})"/>
  ${migalhas}
  <ellipse cx="80" cy="96" rx="12" ry="26" fill="#fff" opacity=".3" transform="rotate(20 80 96)"/>`;
}

function _quibe() {
  const id = _uid();
  return `<defs><radialGradient id="${id}" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#c89159"/><stop offset=".6" stop-color="#8d5a2c"/><stop offset="1" stop-color="#5e3815"/></radialGradient></defs>
  <path d="M24 112 C58 54 142 54 176 112 C142 168 58 168 24 112Z" fill="url(#${id})"/>
  <path d="M50 100 C80 88 120 88 150 100 M46 116 C80 108 120 108 154 116 M52 132 C80 126 120 126 148 132" stroke="#5a3412" stroke-width="2.5" fill="none" opacity=".45" stroke-linecap="round"/>
  <ellipse cx="82" cy="88" rx="30" ry="8" fill="#fff" opacity=".28"/>`;
}

/**
 * Copo genérico. o: { liquido, nivel (0-1), gelo, canudo, espuma, fruta, americano }
 */
function _copo(o = {}) {
  const id = _uid();
  const liq = o.liquido || '#ff9a1f';
  const topo = 46 + (1 - (o.nivel ?? 0.82)) * 120;
  const corpo = 'M56 42 L144 42 L133 172 Q100 182 67 172 Z';
  const gelo = o.gelo
    ? [[78, topo + 8, -14], [108, topo + 4, 12], [94, topo + 26, 4]]
        .map(([x, y, r]) => `<rect x="${x}" y="${y}" width="24" height="22" rx="5" fill="#fff" opacity=".55" transform="rotate(${r} ${x + 12} ${y + 11})"/>`)
        .join('')
    : '';
  const facetas = o.americano
    ? [70, 85, 100, 115, 130].map((x) => `<line x1="${x}" y1="44" x2="${x + (100 - x) * 0.12}" y2="172" stroke="#fff" stroke-width="2" opacity=".25"/>`).join('')
    : '';
  return `<defs>
    <clipPath id="${id}c"><path d="${corpo}"/></clipPath>
    <linearGradient id="${id}l" x1="0" x2="1"><stop offset="0" stop-color="${clarear(liq, 0.25)}"/><stop offset=".45" stop-color="${liq}"/><stop offset="1" stop-color="${escurecer(liq, 0.3)}"/></linearGradient>
  </defs>
  ${o.canudo ? `<g transform="rotate(14 120 60)"><rect x="114" y="6" width="10" height="120" rx="5" fill="${o.canudo}"/><rect x="114" y="6" width="4" height="120" rx="2" fill="#fff" opacity=".4"/></g>` : ''}
  <path d="${corpo}" fill="#ffffff" opacity=".35"/>
  <g clip-path="url(#${id}c)">
    <rect x="40" y="${topo}" width="120" height="150" fill="url(#${id}l)"/>
    <ellipse cx="100" cy="${topo}" rx="50" ry="7" fill="${o.espuma ? '#fff8e6' : clarear(liq, 0.35)}"/>
    ${o.espuma ? `<rect x="40" y="${topo}" width="120" height="10" fill="#fff8e6" opacity=".9"/>` : ''}
    ${gelo}
    ${facetas}
  </g>
  <path d="M66 50 L74 166" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".45"/>
  <ellipse cx="100" cy="42" rx="44" ry="7" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/>
  ${o.fruta ? `<g transform="translate(140 40)"><circle r="20" fill="${o.fruta}"/><circle r="15" fill="${clarear(o.fruta, 0.45)}"/><path d="M0 0 L0 -15 M0 0 L13 -7.5 M0 0 L13 7.5 M0 0 L0 15 M0 0 L-13 7.5 M0 0 L-13 -7.5" stroke="${o.fruta}" stroke-width="2"/></g>` : ''}`;
}

function _xicara(o = {}) {
  const id = _uid();
  const liq = o.liquido || '#4a2a14';
  return `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#e6e2dc"/><stop offset=".4" stop-color="#ffffff"/><stop offset="1" stop-color="#cfc8bf"/></linearGradient></defs>
  <g class="vapor" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".75">
    <path d="M82 60 C72 46 92 38 82 22"/><path d="M102 58 C92 42 112 34 102 16"/><path d="M122 60 C112 46 132 38 122 22"/>
  </g>
  <ellipse cx="100" cy="164" rx="78" ry="16" fill="#d9d3cb"/>
  <ellipse cx="100" cy="160" rx="78" ry="15" fill="url(#${id})"/>
  <path d="M148 96 C178 92 178 136 140 132" stroke="#e9e5df" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M46 78 L154 78 Q152 148 100 154 Q48 148 46 78Z" fill="url(#${id})"/>
  <ellipse cx="100" cy="78" rx="54" ry="11" fill="#f4f1ec"/>
  <ellipse cx="100" cy="79" rx="47" ry="8" fill="${liq}"/>
  <ellipse cx="92" cy="77" rx="22" ry="3" fill="${clarear(liq, 0.35)}" opacity=".7"/>
  <path d="M60 90 Q64 130 90 144" stroke="#fff" stroke-width="7" fill="none" opacity=".7" stroke-linecap="round"/>`;
}

function _lata(o = {}) {
  const id = _uid();
  const cor = o.cor || '#d7141a';
  const h = o.baixa ? 104 : 132;
  const t = 172 - h;
  const meio = t + h * 0.55;
  return `<defs>
    <linearGradient id="${id}c" x1="0" x2="1"><stop offset="0" stop-color="${escurecer(cor, 0.45)}"/><stop offset=".22" stop-color="${cor}"/><stop offset=".42" stop-color="${clarear(cor, 0.35)}"/><stop offset=".7" stop-color="${cor}"/><stop offset="1" stop-color="${escurecer(cor, 0.55)}"/></linearGradient>
    <linearGradient id="${id}m" x1="0" x2="1"><stop offset="0" stop-color="#8d939a"/><stop offset=".4" stop-color="#f4f6f8"/><stop offset="1" stop-color="#7b8188"/></linearGradient>
    <clipPath id="${id}k"><rect x="62" y="${t}" width="76" height="${h}"/></clipPath>
  </defs>
  <ellipse cx="100" cy="172" rx="38" ry="8" fill="url(#${id}m)"/>
  <rect x="62" y="${t}" width="76" height="${h}" fill="url(#${id}c)"/>
  <g clip-path="url(#${id}k)">
    <path d="M62 ${meio} C86 ${meio - 16} 114 ${meio + 16} 138 ${meio} L138 ${meio + 9} C114 ${meio + 25} 86 ${meio - 7} 62 ${meio + 9}Z" fill="#fff" opacity=".9"/>
    <rect x="62" y="${t}" width="76" height="12" fill="url(#${id}m)"/>
  </g>
  <rect x="64" y="${t - 6}" width="72" height="10" rx="4" fill="url(#${id}m)"/>
  <ellipse cx="100" cy="${t - 6}" rx="36" ry="7" fill="url(#${id}m)"/>
  <ellipse cx="100" cy="${t - 6}" rx="29" ry="5" fill="#a9aeb4"/>
  <rect x="94" y="${t - 11}" width="18" height="7" rx="3.5" fill="#d8dce0" stroke="#8d939a" stroke-width="1.5"/>
  <rect x="76" y="${t + 12}" width="7" height="${h - 22}" rx="3.5" fill="#fff" opacity=".35"/>
  <g fill="#fff" opacity=".65"><ellipse cx="118" cy="${t + 30}" rx="2" ry="3"/><ellipse cx="124" cy="${t + 62}" rx="1.6" ry="2.4"/><ellipse cx="110" cy="${t + 96}" rx="2" ry="3"/><ellipse cx="90" cy="${t + 44}" rx="1.4" ry="2"/></g>`;
}

/** Garrafa PET. o: { cor (rótulo/tampa), liquido, grande, gas } */
function _garrafa(o = {}) {
  const id = _uid();
  const cor = o.cor || '#d7141a';
  const liq = o.liquido || '#3a1c10';
  const m = o.grande ? 38 : 30; // meia largura
  const L = 100 - m;
  const R = 100 + m;
  const corpo = `M91 40 L109 40 L111 56 C111 66 ${R} 72 ${R} 94 L${R} 166 C${R} 175 ${R - 7} 180 ${R - 15} 180 L${L + 15} 180 C${L + 7} 180 ${L} 175 ${L} 166 L${L} 94 C${L} 72 89 66 89 56Z`;
  const bolhas = o.gas
    ? [[90, 150], [108, 132], [96, 112], [112, 162], [84, 124]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${2 + (i % 2)}" fill="#fff" opacity=".7"/>`).join('')
    : '';
  return `<defs>
    <clipPath id="${id}k"><path d="${corpo}"/></clipPath>
    <linearGradient id="${id}l" x1="0" x2="1"><stop offset="0" stop-color="${escurecer(liq, 0.2)}"/><stop offset=".4" stop-color="${clarear(liq, 0.15)}"/><stop offset="1" stop-color="${escurecer(liq, 0.35)}"/></linearGradient>
    <linearGradient id="${id}r" x1="0" x2="1"><stop offset="0" stop-color="${escurecer(cor, 0.35)}"/><stop offset=".4" stop-color="${clarear(cor, 0.2)}"/><stop offset="1" stop-color="${escurecer(cor, 0.4)}"/></linearGradient>
  </defs>
  <path d="${corpo}" fill="#fff" opacity=".3"/>
  <g clip-path="url(#${id}k)">
    <rect x="40" y="70" width="120" height="120" fill="url(#${id}l)"/>
    <ellipse cx="100" cy="70" rx="${m}" ry="4" fill="${clarear(liq, 0.3)}"/>
    ${bolhas}
    <rect x="40" y="104" width="120" height="40" fill="url(#${id}r)"/>
    <path d="M40 120 C70 112 130 130 160 120" stroke="#fff" stroke-width="4" fill="none" opacity=".85"/>
    <path d="M40 168 C70 172 130 172 160 168" stroke="#000" stroke-width="10" fill="none" opacity=".12"/>
  </g>
  <path d="${corpo}" fill="none" stroke="#fff" stroke-width="2" opacity=".55"/>
  <rect x="${L + 8}" y="84" width="7" height="82" rx="3.5" fill="#fff" opacity=".45"/>
  <rect x="86" y="34" width="28" height="6" rx="2" fill="${escurecer(cor, 0.25)}"/>
  <rect x="88" y="18" width="24" height="17" rx="4" fill="${cor}"/>
  <rect x="91" y="20" width="5" height="13" rx="2" fill="#fff" opacity=".35"/>`;
}

function _generico() {
  const id = _uid();
  return `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#cfd3d8"/><stop offset=".45" stop-color="#ffffff"/><stop offset="1" stop-color="#b9bec4"/></linearGradient></defs>
  <ellipse cx="100" cy="150" rx="82" ry="18" fill="#e8e4df"/>
  <path d="M36 146 C36 84 164 84 164 146Z" fill="url(#${id})"/>
  <circle cx="100" cy="82" r="9" fill="url(#${id})"/>
  <path d="M58 128 C60 106 74 96 90 92" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".8"/>`;
}

/* ---------------------- Composição ---------------------- */

/** Posiciona um desenho (string interna) com escala/deslocamento. */
function _pos(conteudo, x, y, s) {
  return `<g transform="translate(${x} ${y}) scale(${s})">${conteudo}</g>`;
}

/** Desenho base de um item para um sabor específico (string interna do SVG). */
function desenhoItem(item, sabor) {
  const nome = semAcento(item.nome);
  const s = sabor || '';
  switch (item.ilustracao) {
    case 'pastel':
      return _pastel({ sabor: s });
    case 'salgado':
      if (/quibe|kibe/.test(semAcento(s))) return _quibe();
      if (/coxinha/.test(semAcento(s))) return _coxinha();
      return _pos(_quibe(), 78, 84, 0.6) + _pos(_coxinha(), 2, 22, 0.68);
    case 'caldo':
      // "Com limão" ganha uma rodela de limão na borda do copo.
      return _copo({ liquido: '#cbd65e', espuma: true, canudo: '#2f9e44', nivel: 0.86, fruta: /com limao/.test(semAcento(s)) ? '#8cc63f' : null });
    case 'cafe':
      return _xicara({ liquido: '#4a2a14' });
    case 'cafe-leite':
      return _copo({ liquido: '#c08c5c', espuma: true, americano: true, nivel: 0.8 });
    case 'suco':
      return _copo({ liquido: corLiquido(s, '#ff9a1f'), canudo: '#ffffff', fruta: corSabor(s, '#ff8a00'), nivel: 0.85 });
    case 'refresco':
      return _copo({ liquido: corLiquido(s, '#f7a24b'), gelo: true, nivel: 0.8 });
    case 'lata':
      return _lata({ cor: corSabor(s, '#d7141a'), baixa: /220/.test(nome) });
    case 'garrafa':
      return _garrafa({ cor: corSabor(s, '#d7141a'), liquido: corLiquido(s, '#3a1c10'), grande: /2\s*l|2 litros/.test(nome) });
    case 'agua':
      return _garrafa({ cor: '#2b7bd6', liquido: '#d6ecff', gas: /com gas/.test(nome) });
    default:
      return _generico();
  }
}

/** Para a vitrine: itens com vários sabores mostram 2–3 lado a lado. */
function desenhoVitrine(item, cardapio) {
  if (item.ilustracao === 'combo') return desenhoCombo(item, cardapio);
  const ops = (item.opcoes || []).filter((o) => o.ativo);
  const leque = ['lata', 'garrafa', 'suco', 'refresco'].includes(item.ilustracao) && ops.length >= 2;
  // Pastel e salgado na vitrine aparecem "neutros" (sem marcar sabor).
  if (!leque) return desenhoItem(item, ['pastel', 'salgado'].includes(item.ilustracao) ? '' : ops[0] && ops[0].nome);
  const [a, b, c] = ops;
  return (
    (c ? _pos(desenhoItem(item, c.nome), 78, 30, 0.62) : '') +
    _pos(desenhoItem(item, b.nome), c ? -2 : 62, 30, 0.62) +
    _pos(desenhoItem(item, a.nome), c ? 32 : 2, 22, c ? 0.7 : 0.66)
  );
}

/** Combo: monta a cena a partir das partes (ex: pilha de pastéis + bebida). */
function desenhoCombo(item, cardapio) {
  const partes = (item.slots || [])
    .map((s) => {
      const fonte = cardapio && cardapio.itens.find((i) => i.id === s.itemId);
      const op = fonte && (fonte.opcoes || []).find((o) => o.ativo);
      const neutro = fonte && ['pastel', 'salgado'].includes(fonte.ilustracao) && !(fonte.ilustracao === 'salgado' && op);
      return fonte ? { fonte, sabor: neutro ? '' : op && op.nome, qtd: s.quantidade } : null;
    })
    .filter(Boolean);
  if (!partes.length) return _generico();

  const [p1, p2] = partes;
  // Pilha da 1ª parte (até 3 unidades visíveis)
  const n = Math.min(3, p1.qtd);
  let cena = '';
  const escala = p2 ? 0.62 : 0.72;
  const baseX = p2 ? 4 : 28;
  for (let i = 0; i < n; i++) cena += _pos(desenhoItem(p1.fonte, p1.sabor), baseX + i * 6, 70 - i * 26, escala);
  if (p2) cena += _pos(desenhoItem(p2.fonte, p2.sabor), 92, 40, 0.58);
  return cena;
}

/** SVG completo de um item para a vitrine/montador. */
function svgItem(item, cardapio, sabor) {
  if (item.imagem) return `<img src="${esc(item.imagem)}" alt="" loading="lazy" draggable="false">`;
  const corpo = sabor === undefined ? desenhoVitrine(item, cardapio) : desenhoItem(item, sabor);
  return `<svg viewBox="0 0 200 200" aria-hidden="true">${corpo}</svg>`;
}

/** Cor de fundo suave do "palco" do produto. */
function fundoItem(item, sabor) {
  const base = {
    pastel: '#ffb547',
    salgado: '#ff9f43',
    caldo: '#b5c94a',
    cafe: '#a0703f',
    'cafe-leite': '#c08c5c',
    suco: '#ffa41f',
    refresco: '#f7a24b',
    agua: '#4aa3ff',
    combo: '#ff7b39',
    generico: '#b0b5ba',
  }[item.ilustracao];
  const op = sabor || ((item.opcoes || []).find((o) => o.ativo) || {}).nome;
  const cor = ['lata', 'garrafa', 'suco', 'refresco'].includes(item.ilustracao) ? corSabor(op, base || '#e85d04') : base || '#e85d04';
  return clarear(cor, 0.78);
}

/** Adivinha a ilustração pelo nome (para itens novos criados no painel). */
function adivinharIlustracao(item) {
  if (item.tipo === 'combo') return 'combo';
  const n = semAcento(item.nome);
  if (/pastel/.test(n)) return 'pastel';
  if (/coxinha|quibe|kibe|salgado|empada|esfiha/.test(n)) return 'salgado';
  if (/caldo|cana/.test(n)) return 'caldo';
  if (/leite|capuccino|cappuccino/.test(n)) return 'cafe-leite';
  if (/cafe|expresso/.test(n)) return 'cafe';
  if (/suco|vitamina/.test(n)) return 'suco';
  if (/refresco/.test(n)) return 'refresco';
  if (/lata/.test(n)) return 'lata';
  if (/refri|refrigerante|600|2l|2 l|garrafa/.test(n)) return 'garrafa';
  if (/agua/.test(n)) return 'agua';
  return 'generico';
}

/** Emoji padrão de uma categoria pelo nome. */
function emojiCategoria(nome) {
  const n = semAcento(nome);
  if (/promo/.test(n)) return '🔥';
  if (/combo/.test(n)) return '🍱';
  if (/lanche|pastel|salgad/.test(n)) return '🥟';
  if (/bebida|refri|suco/.test(n)) return '🥤';
  if (/doce|sobremesa/.test(n)) return '🍰';
  if (/cafe/.test(n)) return '☕';
  return '🍽️';
}
