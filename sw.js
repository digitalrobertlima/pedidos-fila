/**
 * sw.js — Service Worker (PWA)
 * Estratégia "rede primeiro, cache como reserva" para os arquivos do site:
 * sempre pega a versão mais nova quando há internet e abre offline se cair.
 * Requisições ao ntfy.sh (outra origem) NÃO passam pelo cache.
 */
const CACHE = 'pedidos-fila-v1';
const ARQUIVOS = ['./', 'index.html', 'style.css', 'config.js', 'cardapio-seed.js', 'comum.js', 'cliente.js', 'manifest.json', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copia = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
