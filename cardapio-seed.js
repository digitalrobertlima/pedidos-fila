/**
 * ============================================================
 *  cardapio-seed.js — CARDÁPIO INICIAL (SEED DATA)
 * ============================================================
 *  Usado apenas quando ainda não existe cardápio salvo no
 *  aparelho nem publicado no ntfy. Depois da primeira edição
 *  no painel do caixa, o cardápio publicado passa a valer.
 *
 *  MODELO DE DADOS
 *  ---------------
 *  categoria: { id, nome }
 *  item: {
 *    id, categoriaId, nome, descricao, preco, codigoPdv,
 *    ativo,        // liga/desliga (estoque)
 *    promocao,     // destaque "Promoção"
 *    tipo,         // 'simples' | 'combo'
 *    opcoes: [ { id, nome, codigoPdv, ativo } ],   // sabores/variações (itens simples)
 *    slots:  [ { id, nome, quantidade, itemId } ]  // partes do combo (combos)
 *  }
 *  Num combo, cada slot aponta para um item simples (itemId). Os
 *  sabores oferecidos no combo são as opções ativas desse item.
 * ============================================================
 */

/** Atalho para criar uma lista de opções a partir de nomes. */
function _ops(prefixo, nomes) {
  return nomes.map((nome, i) => ({ id: `${prefixo}-${i + 1}`, nome, codigoPdv: '', ativo: true }));
}

/** Atalho para criar um item simples. */
function _simples(id, categoriaId, nome, preco, opcoes = [], descricao = '') {
  return { id, categoriaId, nome, descricao, preco, codigoPdv: '', ativo: true, promocao: false, tipo: 'simples', opcoes, slots: [] };
}

/** Atalho para criar um combo. */
function _combo(id, nome, preco, slots, descricao = '') {
  return {
    id, categoriaId: 'combos', nome, descricao, preco, codigoPdv: '', ativo: true, promocao: false, tipo: 'combo', opcoes: [],
    slots: slots.map((s, i) => ({ id: `${id}-s${i + 1}`, nome: s[0], quantidade: s[1], itemId: s[2] })),
  };
}

const CARDAPIO_SEED = {
  versao: 1,
  atualizadoEm: null,
  categorias: [
    { id: 'combos', nome: 'Combos' },
    { id: 'lanches', nome: 'Lanches' },
    { id: 'bebidas', nome: 'Bebidas' },
  ],
  itens: [
    // ---------------- COMBOS ----------------
    _combo('combo-familia', 'Combo Família', 30.0, [['Pastéis', 10, 'pastel']], '10 pastéis — escolha os sabores'),
    _combo('combo-popular', 'Combo Popular', 12.5, [['Pastéis', 4, 'pastel']], '4 pastéis — escolha os sabores'),
    _combo('combo-tradicional', 'Combo Tradicional', 12.5, [['Pastéis', 3, 'pastel'], ['Refresco', 1, 'refresco-300']], '3 pastéis + 1 refresco'),
    _combo('combo-trem-bao', 'Combo Trem Bão', 14.5, [['Pastéis', 3, 'pastel'], ['Caldo de Cana', 1, 'caldo-300']], '3 pastéis + 1 caldo de cana'),
    _combo('combo-cafezim', 'Combo Cafezim', 9.0, [['Pastéis', 2, 'pastel'], ['Café', 1, 'cafezinho']], '2 pastéis + 1 cafezinho'),
    _combo('combo-lanche', 'Combo Lanche', 9.0, [['Salgado', 1, 'salgado'], ['Refresco', 1, 'refresco-300']], '1 salgado + 1 refresco'),

    // ---------------- LANCHES ----------------
    _simples('pastel', 'lanches', 'Pastel Unidade', 3.5, _ops('pastel', ['Carne', 'Queijo', 'Frango', 'Napolitano', 'Banana'])),
    _simples('salgado', 'lanches', 'Coxinha / Quibe Unidade', 6.5, _ops('salgado', ['Coxinha', 'Quibe'])),

    // ---------------- BEBIDAS ----------------
    _simples('agua-sem-gas', 'bebidas', 'Água Sem Gás 500ml', 3.0),
    _simples('agua-com-gas', 'bebidas', 'Água Com Gás 500ml', 3.5),
    // Caldo de cana: "Sem limão / Com limão" funcionam como opções (cada uma pode ter código PDV).
    _simples('caldo-300', 'bebidas', 'Caldo de Cana 300ml', 5.0, _ops('caldo300', ['Sem limão', 'Com limão'])),
    _simples('caldo-500', 'bebidas', 'Caldo de Cana 500ml', 6.5, _ops('caldo500', ['Sem limão', 'Com limão'])),
    _simples('cafezinho', 'bebidas', 'Cafezinho', 3.0),
    _simples('cafe-leite-200', 'bebidas', 'Café c/ Leite 200ml', 4.5),
    _simples('cafe-leite-300', 'bebidas', 'Café c/ Leite 300ml', 5.5),
    _simples('suco-300', 'bebidas', 'Suco Natural 300ml', 8.0, _ops('suco300', ['Laranja', 'Limonada Suíça'])),
    _simples('suco-500', 'bebidas', 'Suco Natural 500ml', 12.0, _ops('suco500', ['Laranja', 'Limonada Suíça'])),
    _simples('refresco-300', 'bebidas', 'Refresco 300ml', 3.0, _ops('ref300', ['Caju', 'Laranja'])),
    _simples('refresco-500', 'bebidas', 'Refresco 500ml', 4.0, _ops('ref500', ['Caju', 'Laranja'])),
    // Todos os refrigerantes têm sabores próprios — edite/adicione/apague no painel do caixa.
    _simples('refri-lata-220', 'bebidas', 'Refrigerante Lata 220ml', 4.0, _ops('lata220', ['Coca-Cola', 'Coca-Cola Zero', 'Fanta Laranja', 'Fanta Guaraná', 'Sprite'])),
    _simples('refri-lata-350', 'bebidas', 'Refrigerante Lata 350ml', 7.0, _ops('lata350', ['Coca-Cola', 'Coca-Cola Zero', 'Fanta Laranja', 'Fanta Uva', 'Fanta Guaraná'])),
    // Preço 0 = "a definir": o item aparece como indisponível até o gerente cadastrar o preço no painel.
    _simples('refri-600', 'bebidas', 'Refrigerante 600ml', 0, _ops('refri600', ['Kuat', 'Coca-Cola', 'Coca-Cola Zero', 'Sprite'])),
    _simples('refri-2l', 'bebidas', 'Refrigerante 2L', 22.5, _ops('refri2l', ['Coca-Cola', 'Coca-Cola Zero', 'Fanta Laranja', 'Fanta Guaraná', 'Sprite'])),
  ],
};
