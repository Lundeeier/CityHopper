var CACHE = "cityhopper-v5";

/* index.html hentes alltid friskt, slik at versjonslappen på app.js er
   oppdatert. app.js, ikoner og manifest mellomlagres, og siden app.js har
   en innholdshash i adressen, får en ny versjon en ny adresse og hentes
   automatisk. Gammel kode kan derfor ikke bli liggende igjen. */

self.addEventListener("install", function (e) {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names.map(function (n) {
            if (n !== CACHE) return caches.delete(n);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function isAsset(url) {
  return /\/(app\.js|leaflet\.js|icon-192\.png|icon-512\.png|manifest\.webmanifest)$/.test(url.pathname);
}

/* Rydder bort tidligere versjoner av samme fil, slik at mellomlageret
   ikke vokser med en kopi per utgivelse. */
function dropOlder(cache, url) {
  return cache.keys().then(function (keys) {
    return Promise.all(
      keys.map(function (k) {
        var u = new URL(k.url);
        if (u.pathname === url.pathname && k.url !== url.href) return cache.delete(k);
      })
    );
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try {
    url = new URL(req.url);
  } catch (err) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match("/index.html");
        });
      })
    );
    return;
  }

  if (!isAsset(url)) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(req, copy).then(function () {
              return dropOlder(cache, url);
            });
          });
        }
        return res;
      });
    })
  );
});

/* Varsler: tar imot push fra serveren og viser det, ogsaa naar appen er lukket. */
self.addEventListener("push", function (e) {
  var d = { title: "CityHopper", body: "", url: "/" };
  try {
    if (e.data) {
      var j = e.data.json();
      d.title = j.title || d.title;
      d.body = j.body || "";
      d.url = j.url || "/";
    }
  } catch (err) {
    if (e.data) d.body = e.data.text();
  }
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: "icon-192.png",
      badge: "icon-192.png",
      data: { url: d.url },
      tag: "cityhopper"
    })
  );
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(self.location.origin) === 0 && "focus" in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
