// Service worker do painel: guarda a casca (página, estilo, scripts, fontes, ícones) para abrir sem rede.
// Nunca guarda /api — estado e comandos são sempre ao vivo.
// A navegação só sai do cache quando o celular está sem internet; com rede quem responde é o servidor,
// assim o pedido de senha (Basic Auth, PAINEL_SENHA) continua aparecendo normalmente.
const CACHE = 'painel-v1';
const CASCA = ['/painel/', '/painel/painel.css', '/painel/painel.js', '/js/format.js', '/js/config.js'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // um item que falhar (ex.: 401 antes da senha) não impede a instalação
    await Promise.all(CASCA.map(async (u) => {
      try { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) await c.put(u, r); } catch { /* sem rede */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    if (!navigator.onLine) e.respondWith(caches.match('/painel/').then((r) => r || Response.error()));
    return;
  }
  // rede primeiro (código sempre atualizado depois de um deploy); sem rede, a cópia guardada
  e.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r.ok) (await caches.open(CACHE)).put(req, r.clone());
      return r;
    } catch {
      return (await caches.match(req)) || Response.error();
    }
  })());
});
