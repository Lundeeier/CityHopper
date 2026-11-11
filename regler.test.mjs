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

// TWA: Android godtar appen bare når assetlinks.json har pakkenavnet og fingeravtrykket fra Play-appsignering.
test("assetlinks.json kobler Play-appen til nettsiden", () => {
  const al = JSON.parse(readFileSync("assetlinks.json", "utf8"));
  const t = al[0].target;
  assert.equal(t.package_name, "no.cityhopper.app");
  assert.ok(t.sha256_cert_fingerprints.includes("E8:3D:32:24:83:AC:BE:2D:82:75:0B:83:B7:D7:D9:3F:0B:BA:95:E5:7B:B4:A6:89:71:4A:45:19:71:F5:66:5D"));
  for (const f of t.sha256_cert_fingerprints) assert.match(f, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});

// 8. nov: ekte Nominatim-svar (hentet via nettleseren) for steder som bare finnes som kommune i søket.
const muniOnly = (name, county) => [{ name, addresstype: "municipality", type: "administrative", lat: "61.9", lon: "6.7", osm_type: "relation", osm_id: 9, address: { municipality: name, county, country: "Norge", country_code: "no" }, extratags: { place: "municipality" } }];
test("søk etter Stryn, Lom og Trysil gir treff (kommunenavn = tettsted)", async () => {
  const old = w.fetch;
  try {
    for (const [n, c] of [["Stryn", "Vestland"], ["Lom", "Innlandet"], ["Trysil", "Innlandet"]]) {
      w.fetch = fake(muniOnly(n, c));
      const r = await R.e5(n, "Norge");
      assert.equal(r[0] && r[0].place, n, n + " ga ikke treff");
    }
  } finally {
    w.fetch = old;
  }
});
test("sammenslåtte kommuner gir fortsatt ikke treff", async () => {
  const old = w.fetch;
  try {
    for (const n of ["Aurskog-Høland", "Nordre Follo", "Indre Østfold", "Evje og Hornnes"]) {
      w.fetch = fake(muniOnly(n, "X"));
      assert.equal((await R.e5(n, "Norge")).length, 0, n + " skulle ikke gitt treff");
    }
    assert.equal(R.ChMergedMuni("Stryn"), false);
    assert.equal(R.ChMergedMuni("Øvre Eiker"), true);
  } finally {
    w.fetch = old;
  }
});
test("søk etter Molde (kommune + by) gir byen", async () => {
  const old = w.fetch;
  w.fetch = fake([
    { name: "Molde", addresstype: "municipality", type: "administrative", lat: "62.7", lon: "7.2", osm_type: "relation", osm_id: 1, address: { municipality: "Molde", county: "Møre og Romsdal", country: "Norge", country_code: "no" }, extratags: { place: "municipality" } },
    { name: "Molde", addresstype: "town", type: "town", lat: "62.73", lon: "7.16", osm_type: "node", osm_id: 2, address: { town: "Molde", municipality: "Molde", county: "Møre og Romsdal", postcode: "6413", country: "Norge", country_code: "no" }, extratags: {} },
  ]);
  try {
    const r = await R.e5("Molde", "Norge");
    assert.equal(r.length, 1);
    assert.equal(r[0].place, "Molde");
  } finally {
    w.fetch = old;
  }
});

// 8. nov: Kristians liste over steder som feilet. Svarene under er ekte Nominatim-svar (forkortet).
const no = (o) => ({ country: "Norge", country_code: "no", ...o });
const NOM = {
  Vossestrand: [{ name: "Vinje", addresstype: "village", type: "village", lat: "60.79", lon: "6.51", osm_type: "node", osm_id: 264564816, address: no({ village: "Vinje", municipality: "Voss", county: "Vestland", postcode: "5713" }), extratags: {}, namedetails: { name: "Vinje", alt_name: "Vossestrand" } }],
  Oppstryn: [{ name: "Fosnes", addresstype: "village", type: "village", lat: "61.91", lon: "7.06", osm_type: "node", osm_id: 2, address: no({ village: "Fosnes", municipality: "Stryn", county: "Vestland", postcode: "6799" }), extratags: {}, namedetails: { name: "Fosnes", alt_name: "Oppstryn" } }],
  Mauseidvåg: [{ name: "Mauseidvåg", addresstype: "highway", type: "bus_stop", lat: "62.42", lon: "6.27", osm_type: "node", osm_id: 3, address: no({ highway: "Mauseidvåg", road: "Furnesvegen", hamlet: "Karlsbakken", village: "Mauseidvågen", municipality: "Sula", county: "Møre og Romsdal", postcode: "6035" }), namedetails: { name: "Mauseidvåg" } }],
  Flatanger: [
    { name: "Flatanger", addresstype: "municipality", type: "administrative", lat: "64.53", lon: "10.62", osm_type: "relation", osm_id: 4, address: no({ municipality: "Flatanger", county: "Trøndelag" }), extratags: { place: "municipality" }, namedetails: { name: "Flatanger", ref: "5049" } },
    { name: "Vik", addresstype: "village", type: "village", lat: "64.46", lon: "10.73", osm_type: "node", osm_id: 5, address: no({ village: "Vik", municipality: "Flatanger", county: "Trøndelag", postcode: "7770" }), extratags: {}, namedetails: { name: "Vik", alt_name: "Flatanger" } },
  ],
  Lier: [
    { name: "Lier", addresstype: "municipality", type: "administrative", lat: "59.79", lon: "10.24", osm_type: "relation", osm_id: 6, address: no({ municipality: "Lier", county: "Buskerud" }), extratags: { place: "municipality" }, namedetails: { name: "Lier" } },
    { name: "Lierbyen", addresstype: "village", type: "village", lat: "59.78", lon: "10.24", osm_type: "node", osm_id: 7, address: no({ village: "Lierbyen", municipality: "Lier", county: "Buskerud" }), extratags: {}, namedetails: { name: "Lierbyen" } },
  ],
};
for (const n of ["Nannestad", "Inderøy", "Skjåk", "Tydal"]) NOM[n] = muniOnly(n, "X");
test("Kristians liste: alle stedene gir treff med navnet han skrev", async () => {
  const old = w.fetch;
  try {
    const want = { Vossestrand: "Vossestrand", Oppstryn: "Oppstryn", Mauseidvåg: "Mauseidvågen", Flatanger: "Flatanger", Lier: "Lier", Nannestad: "Nannestad", Inderøy: "Inderøy", Skjåk: "Skjåk", Tydal: "Tydal" };
    for (const [q, place] of Object.entries(want)) {
      w.fetch = fake(NOM[q]);
      const r = await R.e5(q, "Norge");
      assert.equal(r[0] && r[0].place, place, q + " ga " + JSON.stringify(r.map((x) => x.place)));
    }
  } finally {
    w.fetch = old;
  }
});
test("Flatanger: tettstedet (Vik) vinner over kommunens midtpunkt", async () => {
  const old = w.fetch;
  w.fetch = fake(NOM.Flatanger);
  try {
    const r = await R.e5("Flatanger", "Norge");
    assert.equal(r.length, 1);
    assert.equal(r[0].kind, "village");
    assert.equal(r[0].lat, 64.46);
  } finally {
    w.fetch = old;
  }
});
test("treff på vei bruker tettstedet, uten veiens id", async () => {
  const old = w.fetch;
  w.fetch = fake(NOM["Mauseidvåg"]);
  try {
    const r = await R.e5("Mauseidvåg", "Norge");
    assert.equal(r[0].place, "Mauseidvågen");
    assert.equal(r[0].osm, null);
  } finally {
    w.fetch = old;
  }
});

// 8. nov: stort søk (ca. 570 ekte stedsnavn) – gjenstående feil var gård/dal med nøyaktig navn.
test("gård og dal med nøyaktig navn gir treff (Ænes, Vestre Gausdal)", async () => {
  const old = w.fetch;
  try {
    w.fetch = fake([{ name: "Ænes", addresstype: "farm", type: "farm", lat: "60.0", lon: "6.2", osm_type: "node", osm_id: 11, address: no({ farm: "Ænes", municipality: "Kvinnherad", county: "Vestland" }), namedetails: { name: "Ænes" } }]);
    assert.equal((await R.e5("Ænes", "Norge"))[0].place, "Ænes");
    w.fetch = fake([{ name: "Vestre Gausdal", addresstype: "valley", type: "valley", lat: "61.2", lon: "9.9", osm_type: "relation", osm_id: 12, address: no({ municipality: "Gausdal", county: "Innlandet" }), namedetails: { name: "Vestre Gausdal" } }]);
    assert.equal((await R.e5("Vestre Gausdal", "Norge"))[0].place, "Vestre Gausdal");
    w.fetch = fake([{ name: "Storgården", addresstype: "farm", type: "farm", lat: "60.0", lon: "6.2", osm_type: "node", osm_id: 13, address: no({ farm: "Storgården", municipality: "X" }), namedetails: { name: "Storgården" } }]);
    assert.equal((await R.e5("Stor", "Norge")).length, 0);
  } finally {
    w.fetch = old;
  }
});

// 8. nov: merker for 1000, 2500, 5000 og 10 000 steder.
test("merker for 1000, 2500, 5000 og 10 000 steder", () => {
  const visits = [];
  for (let i = 0; i < 2500; i++) visits.push({ id: "v" + i, place: "Teststed " + i, country: "Norge", lat: 58 + (i % 50) * 0.3, lng: 5 + Math.floor(i / 50) * 0.3, visited_on: "2026-01-01" });
  const b = R.ChBadges(visits, "no", null);
  const get = (n) => b.find((x) => x.id === "ant-sted-" + n);
  for (const n of [1000, 2500, 5000, 10000]) assert.ok(get(n), "mangler merke for " + n);
  assert.equal(get(1000).earned, true);
  assert.equal(get(2500).earned, true);
  assert.equal(get(5000).earned, false);
  assert.equal(get(10000).earned, false);
  assert.match(get(10000).label, /10 000/);
  assert.match(get(1000).label, /^1000 /);
});

// Regel: profil, statistikk og lister skal telle alle innsjekker, ikke stoppe på 1000 (Supabase-grensen).
test("ChAllRows henter mer enn 1000 rader i biter", async () => {
  const rows = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
  const calls = [];
  const mk = () => ({ range: async (a, b) => (calls.push([a, b]), { data: rows.slice(a, Math.min(b + 1, 1000 + a)), error: null }) });
  const { data, error } = await R.ChAllRows(mk);
  assert.equal(error, null);
  assert.equal(data.length, 2345);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

// Regel: betaling (støtte, medlemskap, grense på 25 steder) er gjort klar, men skal være AV til Kristian sier fra.
test("betaling er av: ingen knapper og ingen grense", async () => {
  assert.equal(R.CH_PAY_ON, false);
  assert.equal(R.ChPayAvailable(), false);
  assert.equal(await R.ChLimitBlocked("uid", 1), false);
});
test("betaling vises bare i Play-appen (Digital Goods API), aldri på nettsiden", () => {
  const play = { getDigitalGoodsService: () => {}, PaymentRequest: function () {} };
  assert.equal(R.ChPayAvailable(true, play), true);
  assert.equal(R.ChPayAvailable(true, {}), false);
  assert.equal(R.ChPayAvailable(false, play), false);
});
test("gratis gir maks 25 steder, medlemmer har ingen grense", () => {
  assert.equal(R.CH_FREE_LIMIT, 25);
  assert.equal(R.ChLimitHit(24, false), false);
  assert.equal(R.ChLimitHit(25, false), true);
  assert.equal(R.ChLimitHit(1200, false), true);
  assert.equal(R.ChLimitHit(1200, true), false);
  assert.equal(R.ChLimitHit(20, false, 6), true);
  assert.equal(R.ChLimitHit(20, false, 5), false);
});
test("beløp og priser: 25/50/100 + 250/500, og 19 kr/mnd og 149 kr/år", () => {
  assert.equal(R.CH_PAY_GIFTS.map((x) => x.kr).join(), "25,50,100,250,500");
  assert.equal(R.CH_PAY_GIFTS.filter((x) => x.more).map((x) => x.kr).join(), "250,500");
  assert.equal(R.CH_PAY_SUBS.map((x) => x.kr).join(), "19,149");
});
test("betalingstekster finnes på alle sju språk", () => {
  const keys = ["pay_support", "pay_support_text", "pay_other", "pay_via", "pay_thanks", "pay_failed", "pay_member", "pay_member_text", "pay_month", "pay_year", "pay_is_member", "pay_limit"];
  for (const lang of ["no", "en", "nl", "de", "sv", "da", "es"]) for (const k of keys) assert.ok(R.LANGS[lang][k], `${lang}.${k} mangler`);
  assert.equal(R.P("no", "pay_limit", { n: 25 }), "Gratis gir plass til 25 steder. Bli medlem under Innstillinger for å legge til flere.");
});
test("støttepanelet: 25/50/100, «Annet beløp» gir 250/500, kjøp gir takk", async () => {
  const log = [];
  w.getDigitalGoodsService = async () => ({
    getDetails: async (ids) => ids.map((id) => ({ itemId: id, price: { currency: "NOK", value: id.split("_")[1] } })),
    listPurchases: async () => [],
    consume: async (t) => log.push("consume " + t),
  });
  w.PaymentRequest = function (m) {
    this.show = async () => ({ details: { purchaseToken: "tok-" + m[0].data.sku }, complete: async () => log.push("complete") });
  };
  const el = w.document.createElement("div");
  w.document.body.appendChild(el);
  R.mountPay(el, { mode: "gift", onClose() {} });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(80);
  const labels = () => [...el.querySelectorAll("button")].map((b) => b.textContent);
  const has = (t) => labels().some((l) => l.replace(/\s/g, " ").includes(t));
  assert.ok(has("25") && has("50") && has("100"), labels().join("|"));
  assert.ok(!has("250") && !has("500"), "250/500 skal være skjult først");
  [...el.querySelectorAll("button")].at(-1).click();
  await wait(50);
  assert.ok(has("250") && has("500"), labels().join("|"));
  [...el.querySelectorAll("button")].find((b) => /\b25\b/.test(b.textContent.replace(/\s/g, " "))).click();
  await wait(80);
  assert.equal(log.join(), "consume tok-stott_25,complete");
  assert.ok(["no", "en"].some((l) => el.textContent.includes(R.P(l, "pay_thanks"))), el.textContent);
  delete w.getDigitalGoodsService;
  delete w.PaymentRequest;
});
