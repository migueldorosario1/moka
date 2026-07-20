/**
 * Service Worker do igot.
 *
 * Estratégia offline-first CONSERVATIVA:
 *  - Shell do app (HTML/JS/CSS/fontes) → cache-first, com fallback de rede.
 *  - Imagens estáticas (próprias) → cache-first.
 *  - Tudo o mais (inclusive /api/proxy = chamadas de IA) → SEMPRE rede,
 *    nunca cacheado. A IA tem que estar sempre atualizada e não pode
 *    devolver resposta velha.
 *
 * Assim, no iPad, você consegue abrir o app offline e ler livros já
 * carregados, mas a IA continua exigindo conexão (esperado).
 */

const VERSION = "__MOKA_SW_VERSION__";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Pré-cache do shell mínimo (a Home). O resto é populado on-demand.
const SHELL_ASSETS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

// ─── Install: pré-cachear o shell ────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// ─── Activate: limpar caches antigos ─────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ─── Fetch: estratégia por tipo de requisição ────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Apenas GET. POST (API de IA, upload) passa direto pra rede.
  if (request.method !== "GET") return;

  // Chamadas de IA NUNCA cacheiam — sempre rede.
  if (url.pathname.startsWith("/api/")) return;

  // Navegações (HTML): network-first com fallback pro shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Assets estáticos próprios: cache-first, fallback rede.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return (
          cached ||
          fetch(request)
            .then((res) => {
              if (res.ok) {
                const copy = res.clone();
                caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
              }
              return res;
            })
            .catch(() => cached)
        );
      }),
    );
  }

  // Recursos de outros origens (CDNs, fontes): deixamos o navegador cuidar.
});
