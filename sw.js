var CACHE = "cityhopper-v2";

self.addEventListener("install", function (e) { self.skipWaiting(); });

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (names) { return Promise.all(names.map(function (n) { return caches.delete(n); })); })
      .then(function () { return self.clients.claim(); })
  );
});

/* Ingen mellomlagring av sider eller skript: appen krever nettverk uansett
   (database og kart), så alt hentes friskt hver gang for å unngå at
   telefonen viser en utdatert versjon av koden. */
