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
