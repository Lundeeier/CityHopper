// Regeltester for CityHopper. Kjøres av build.mjs etter røyktesten, slik at en endring
// som bryter en regel aldri blir publisert. Tester den ferdig bygde appen (dist/app.js).
// Kjør selv: node --test regler.test.mjs (etter node build.mjs).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<div id="root"></div>', { runScripts: "outside-only", url: "https://cityhoppers.netlify.app/", pretendToBeVisual: true });
const w = dom.window;
w.fetch = () => Promise.reject(new Error("offline"));
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.console.error = () => {};
w.__CH_TEST = {};
w.eval(readFileSync("dist/app.js", "utf8"));
const R = w.__CH_TEST;
// Appen har tidtakere som ellers holder prosessen i live etter testene.
after(() => {
  w.close();
  setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
});

test("testkroken finnes", () => {
  for (const f of ["ChPlaceFrom", "ChPostName", "ChNameChoice", "ChPostOk", "ChKey"]) assert.equal(typeof R[f], "function", f);
});

// Regel: aldri kommunenavn som sted, i noe land.
test("kommune gir tettstedet, ikke kommunen (Aurskog-Høland → Aursmoen)", () => {
  assert.equal(R.ChPlaceFrom({ village: "Aursmoen", municipality: "Aurskog-Høland kommune", county: "Akershus" }, "municipality", "Aurskog-Høland kommune"), "Aursmoen");
});
test("bare kommune og ingen sted gir null", () => {
  assert.equal(R.ChPlaceFrom({ municipality: "Aurskog-Høland kommune", county: "Akershus" }, "municipality", "Aurskog-Høland kommune"), null);
});
test("svensk kommun gir byen (Uppsala kommun → Uppsala)", () => {
  assert.equal(R.ChPlaceFrom({ city: "Uppsala", municipality: "Uppsala kommun" }, "municipality", "Uppsala kommun"), "Uppsala");
});
test("dansk og nederlandsk kommune gir byen", () => {
  assert.equal(R.ChPlaceFrom({ town: "Silkeborg", municipality: "Silkeborg Kommune" }, "municipality", "Silkeborg Kommune"), "Silkeborg");
  assert.equal(R.ChPlaceFrom({ town: "Zwolle", municipality: "Gemeente Zwolle" }, "municipality", "Gemeente Zwolle"), "Zwolle");
});
test("by med samme navn som kommunen er lov (Oslo, Lillestrøm)", () => {
  assert.equal(R.ChPlaceFrom({ city: "Oslo", municipality: "Oslo" }, "city", "Oslo"), "Oslo");
  assert.equal(R.ChPlaceFrom({ town: "Lillestrøm", municipality: "Lillestrøm" }, "town", "Lillestrøm"), "Lillestrøm");
});
test("bydel i by gir byen", () => {
  assert.equal(R.ChPlaceFrom({ suburb: "Grünerløkka", city: "Oslo", municipality: "Oslo" }, "suburb", "Grünerløkka"), "Oslo");
});
test("grend uten by gir grenda, ikke kommunen", () => {
  assert.equal(R.ChPlaceFrom({ hamlet: "Hølandsbyen", municipality: "Aurskog-Høland kommune" }, "hamlet", "Hølandsbyen"), "Hølandsbyen");
  assert.equal(R.ChPlaceFrom({ locality: "Fjellstua", municipality: "Ringsaker kommune" }, "locality", "Fjellstua"), "Fjellstua");
});
test("fylke eller län blir aldri sted", () => {
  assert.equal(R.ChPlaceFrom({ county: "Akershus fylke" }, "county", "Akershus fylke"), null);
  assert.equal(R.ChPlaceFrom({ county: "Uppsala län" }, "state", "Uppsala län"), null);
});

// Postnummer
test("poststed fra postnummer bruker tettstedet", () => {
  assert.equal(R.ChPostName({ village: "Aurskog", municipality: "Aurskog-Høland kommune" }), "Aurskog");
});
test("postnummer uten tettsted gir ikke kommunen", () => {
  assert.equal(R.ChPostName({ municipality: "Øyer kommune", county: "Innlandet" }), null);
});
test("poststed som er fylket brukes ikke", () => {
  assert.equal(R.ChPostName({ city: "Oslo", county: "Oslo" }), null);
});
test("postnummer for langt unna (over 40 km) godtas ikke", () => {
  assert.equal(R.ChPostOk({ place: "X", lat: 60, lng: 11 }, 60, 11.1), true);
  assert.equal(R.ChPostOk({ place: "X", lat: 61, lng: 11 }, 60, 11), false);
});

// Navnevalg ved live-innsjekk
const here = { lat: 59.92, lng: 11.43 };
test("Aursmoen / 1930 Aurskog gir to valg", () => {
  const c = R.ChNameChoice({ place: "Aursmoen", own: true, muni: "Aurskog-Høland kommune", postcode: "1930", osm: "N1" }, { place: "Aurskog", lat: 59.93, lng: 11.44, osm: "N2" }, here.lat, here.lng);
  assert.equal(c.use.place, "Aursmoen");
  assert.ok(c.alt);
  assert.equal(c.alt.map.place, "Aursmoen");
  assert.equal(c.alt.post.place, "Aurskog");
  assert.equal(c.alt.post.code, "1930");
});
test("Bjørkelangen: kommunenavn fra postnummer gir verken valg eller bytte", () => {
  const c = R.ChNameChoice({ place: "Bjørkelangen", own: true, muni: "Aurskog-Høland kommune", postcode: "1940" }, { place: "Aurskog-Høland", lat: 59.88, lng: 11.56 }, 59.88, 11.57);
  assert.equal(c.use.place, "Bjørkelangen");
  assert.equal(c.alt, null);
});
test("samme navn fra kart og postnummer gir ingen valg", () => {
  const c = R.ChNameChoice({ place: "Lillestrøm", own: true, postcode: "2000" }, { place: "Lillestrøm", lat: 59.95, lng: 11.05 }, 59.95, 11.05);
  assert.equal(c.alt, null);
});
test("uten postnummertreff brukes kartnavnet", () => {
  const c = R.ChNameChoice({ place: "Aursmoen", own: true, postcode: null }, null, here.lat, here.lng);
  assert.equal(c.use.place, "Aursmoen");
  assert.equal(c.alt, null);
});

// Stedsnøkkel (duplikatsjekk)
test("samme sted med ulik skrivemåte regnes som likt", () => {
  assert.equal(R.ChKey("lillestrøm", "Norge"), R.ChKey("Lillestrøm", "Norge"));
  assert.notEqual(R.ChKey("Lillestrøm", "Norge"), R.ChKey("Lillehammer", "Norge"));
});

// Nettstatus-banner
test("banner vises uten nett og forsvinner når nettet er tilbake", async () => {
  await new Promise((r) => setTimeout(r, 800));
  w.dispatchEvent(new w.Event("offline"));
  await new Promise((r) => setTimeout(r, 100));
  const a = w.document.querySelector('[role="alert"]');
  assert.ok(a, "fant ikke banneret");
  assert.match(a.textContent, /offline|uten nett/i);
  w.dispatchEvent(new w.Event("online"));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(w.document.querySelector('[role="alert"]'), null);
});
test("banner vises når serveren ikke svarer", async () => {
  w.dispatchEvent(new w.CustomEvent("ch-net", { detail: "down" }));
  await new Promise((r) => setTimeout(r, 100));
  const a = w.document.querySelector('[role="alert"]');
  assert.ok(a, "fant ikke banneret");
  assert.match(a.textContent, /server/i);
  w.dispatchEvent(new w.CustomEvent("ch-net", { detail: "ok" }));
});

// Nye brukere: de første sekundene
test("innloggingsskjermen forteller hva appen er", async () => {
  await new Promise((r) => setTimeout(r, 300));
  const pitch = w.document.querySelector(".ch-pitch");
  assert.ok(pitch, "fant ikke beskrivelsen av appen");
  assert.ok(pitch.textContent.length > 20);
});
test("tekstene for første sted og nettbanner finnes på alle sju språk", () => {
  const keys = ["app_pitch", "first_title", "first_sub", "first_btn", "net_offline", "net_down", "name_choice_title", "name_choice_sub", "name_from_map", "name_from_post"];
  for (const lang of ["no", "en", "nl", "de", "sv", "da", "es"]) for (const k of keys) assert.ok(R.LANGS[lang] && R.LANGS[lang][k], `${lang}.${k} mangler`);
});

// 8. nov: store byer der kommunen er koblet til byen (Harstad, Stavanger) skal kunne legges inn.
const fake = (data) => () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
test("kommune koblet til by med samme navn gir byen (Harstad)", () => {
  assert.equal(R.ChLinked({ extratags: { linked_place: "town" } }), true);
  assert.equal(R.ChLinked({ extratags: {} }), false);
  assert.equal(R.ChPlaceFrom({ municipality: "Harstad", county: "Troms" }, "municipality", "Harstad", true), "Harstad");
  assert.equal(R.ChPlaceFrom({ municipality: "Aurskog-Høland kommune" }, "municipality", "Aurskog-Høland kommune", false), null);
});
test("søk etter Harstad og Stavanger gir treff", async () => {
  const old = w.fetch;
  w.fetch = fake([
    { name: "Harstad", addresstype: "municipality", type: "administrative", lat: "68.79", lon: "16.54", osm_type: "relation", osm_id: 1, address: { municipality: "Harstad", county: "Troms", country: "Norge", country_code: "no" }, extratags: { linked_place: "town" } },
  ]);
  try {
    const r = await R.e5("Harstad", "Norge");
    assert.equal(r.length, 1);
    assert.equal(r[0].place, "Harstad");
    w.fetch = fake([
      { name: "Stavanger", addresstype: "municipality", type: "administrative", lat: "58.97", lon: "5.73", osm_type: "relation", osm_id: 2, address: { municipality: "Stavanger", county: "Rogaland", country: "Norge", country_code: "no" }, extratags: { linked_place: "city" } },
    ]);
    const s = await R.e5("Stavanger", "Norge");
    assert.equal(s[0] && s[0].place, "Stavanger");
  } finally {
    w.fetch = old;
  }
});
test("søk etter en ren kommune uten by gir ikke kommunen", async () => {
  const old = w.fetch;
  w.fetch = fake([
    { name: "Aurskog-Høland", addresstype: "municipality", type: "administrative", lat: "59.9", lon: "11.5", osm_type: "relation", osm_id: 3, address: { municipality: "Aurskog-Høland", county: "Akershus", country: "Norge", country_code: "no" }, extratags: { wikidata: "Q1" } },
  ]);
  try {
    assert.equal((await R.e5("Aurskog-Høland", "Norge")).length, 0);
  } finally {
    w.fetch = old;
  }
});
test("live-innsjekk midt i Harstad gir Harstad", async () => {
  const old = w.fetch;
  w.fetch = fake({ name: "Harstad", addresstype: "municipality", type: "administrative", osm_type: "relation", osm_id: 1, address: { municipality: "Harstad", county: "Troms", postcode: "9405", country: "Norge", country_code: "no" }, extratags: { linked_place: "town" } });
  try {
    const g = await R.f8(68.79, 16.54);
    assert.equal(g.place, "Harstad");
  } finally {
    w.fetch = old;
  }
});
test("varsler gjenkjenner Android-appen", () => {
  assert.equal(typeof R.ChInApp(), "boolean");
  for (const lang of ["no", "en", "nl", "de", "sv", "da", "es"]) {
    assert.ok(R.LANGS[lang].push_inapp, lang + ".push_inapp mangler");
    assert.ok(R.LANGS[lang].show_on_map, lang + ".show_on_map mangler");
  }
});

// 8. nov: fullskjerm for nye merker (valg B: kartet øverst)
test("merke-kart: land, verden og region gir kart", () => {
  w.eval(readFileSync("regions.js", "utf8"));
  const vis = new w.Set(["NO", "SE"]);
  assert.match(R.ChBadgeMapSvg({ id: "land-NO" }, null, vis, 800) || "", /^<svg/);
  assert.match(R.ChBadgeMapSvg({ id: "norden" }, null, vis, 800) || "", /^<svg/);
  assert.match(R.ChBadgeMapSvg({ id: "uke" }, null, vis, 800) || "", /^<svg/);
  assert.match(R.ChBadgeMapSvg({ id: "reg-NO-u" }, null, vis, 800) || "", /^<svg/);
});
test("nye merker vises i fullskjerm med Neste og Fortsett", async () => {
  const el = w.document.createElement("div");
  w.document.body.appendChild(el);
  let closed = 0;
  R.mount(el, {
    lang: "no",
    badges: [
      { id: "land-NO", label: "Norge", desc: "Første land", group: "countries", flag: "NO" },
      { id: "uke", label: "Ukesvandrer", desc: "Sju dager", group: "special" },
    ],
    chReg: null,
    visCodes: new w.Set(["NO"]),
    onClose: () => closed++,
  });
  await new Promise((r) => setTimeout(r, 150));
  const dlg = w.document.querySelector(".ch-celebrate");
  assert.ok(dlg, "fant ikke fullskjermen");
  assert.match(dlg.querySelector(".ch-celebrate-title").textContent, /Norge/);
  assert.ok(dlg.querySelector(".ch-celebrate-map svg"), "kartet mangler");
  const next = dlg.querySelector(".ch-celebrate-next");
  assert.match(next.textContent, /Neste/);
  next.click();
  await new Promise((r) => setTimeout(r, 100));
  assert.match(w.document.querySelector(".ch-celebrate-title").textContent, /Ukesvandrer/);
  assert.match(w.document.querySelector(".ch-celebrate-next").textContent, /Fortsett/);
  w.document.querySelector(".ch-celebrate-next").click();
  assert.equal(closed, 1);
  for (const lang of ["no", "en", "nl", "de", "sv", "da", "es"]) for (const k of ["bc_share", "bc_done", "bc_next", "bc_text"]) assert.ok(R.LANGS[lang][k], `${lang}.${k} mangler`);
});
test("merkeikon: flagg for land, kart for kartmerker", () => {
  assert.equal(R.ChBadgeEmoji({ id: "land-NO" }), "🇳🇴");
  assert.equal(R.ChBadgeEmoji({ id: "reg-NO-u" }), "🗺️");
  assert.equal(R.ChBadgeEmoji({ id: "land-GB-ENG" }), "🗺️");
  assert.ok(R.ChBadgeEmoji({ id: "ukjent" }));
});
