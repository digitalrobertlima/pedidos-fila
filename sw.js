/**
 * sw.js — Service Worker (PWA)
 * ------------------------------------------------------------
 * - Faz o app abrir mesmo sem internet (cliente e caixa).
 * - Estratégia "REDE PRIMEIRO, sem cache HTTP": com internet, sempre
 *   busca a versão mais nova no servidor; sem internet (ou se a rede
 *   demorar mais de 4s), usa a cópia guardada.
 * - O nome do cache vem de versao.js: ao trocar a versão, o cache
 *   antigo é apagado automaticamente.
 * - Requisições ao ntfy.sh (outra origem) NÃO passam por aqui.
 */
importScripts('versao.js');

const CACHE = `pedidos-fila-${VERSAO_APP}`;
const ARQUIVOS = [
  './',
  'index.html',
  'caixa.html',
  'style.css',
  'versao.js',
  'config.js',
  'cardapio-seed.js',
  'comum.js',
  'ilustracoes.js',
  'cliente.js',
  'caixa.js',
  'manifest.json',
  'manifest-caixa.json',
  'icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/caixa-192.png',
  'icons/caixa-512.png',
  'icons/apple-touch-icon.png',
  'icons/caixa-apple-touch-icon.png',
  'manter-acordado.mp4',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(ARQUIVOS.map((a) => fetch(a, { cache: 'no-cache' }).then((r) => r.ok && c.put(a, r)).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** fetch com tempo limite: rede lenta não pode travar o caixa. */
function buscarComLimite(url, ms) {
  return Promise.race([
    fetch(url, { cache: 'no-cache', credentials: 'same-origin' }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // versao.js com ?t= é a checagem de atualização: sempre direto da rede.
  if (url.pathname.endsWith('versao.js') && url.search) return;

  const chave = url.pathname.endsWith('/') ? './' : url.pathname.split('/').pop();
  e.respondWith(
    buscarComLimite(url.href.split('#')[0], 4000)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return resp;
      })
      .catch(async () => (await caches.match(e.request, { ignoreSearch: true })) || caches.match(chave) || caches.match('./'))
  );
});
