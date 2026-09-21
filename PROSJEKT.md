# CityHopper — prosjektbeskrivelse

Les denne før du endrer noe. Den beskriver hvordan appen er bygget, hvor ting ligger, og hvordan man jobber med eieren.

## Hva appen er

En webapp (PWA) for å logge byer og tettsteder man har besøkt. Brukerne sjekker inn på steder, gir dem stjerner (0–5 i kvarte trinn), legger ved ett bilde og et notat, og konkurrerer med venner i topplister og merker.

- Nettadresse: https://cityhoppers.netlify.app
- Repo: github.com/Lundeeier/CityHopper
- Språk i appen: norsk, engelsk, nederlandsk

## Om eieren

Kristian kan ikke kode. Han bygger appen med AI og jobber mest fra mobil.

**Slik vil han ha det:**
- Én ting om gangen. Aldri fem steg i én melding.
- List opp **alle** filer som skal lastes opp, hver gang. Han har mistet timer på filer som ble glemt.
- Vis heller enn å forklare — skisser og bilder fremfor lange beskrivelser.
- Korte svar. Ingen tilleggskommentarer han ikke har bedt om.
- Når noe feiler: finn årsaken, ikke gjett. Be om byggelogg om nødvendig.

## Filer i repoet

| Fil | Hva den gjør |
|---|---|
| `app.source.js` | Hele appen, ca. 7 600 linjer. Det er denne som endres. |
| `build.mjs` | Bygger appen og kjører røyktesten. |
| `smoke.mjs` | Laster appen i et simulert nettleservindu og stopper publisering hvis den ikke tegner seg. |
| `package.json` | Pakker og versjoner. |
| `netlify.toml` | Forteller Netlify at det skal bygges, med Node 22. |
| `index.html` | Skall. Versjonslappen på `app.js` settes automatisk ved bygging. |
| `sw.js` | Service worker: mellomlagring og mottak av push-varsler. |
| `manifest.webmanifest`, `icon-192.png`, `icon-512.png` | Appinstallasjon og ikon. |

**Arbeidsflyt:** endre `app.source.js` → last opp til GitHub → Netlify bygger og publiserer selv. Ingen versjonsnumre å holde styr på.

## Bygging

`npm run build` lager `dist/` med:
- `app.js` — appen (ca. 660 kB), IIFE-format
- `leaflet.js` — kartbiblioteket (ca. 147 kB), lastes først når Kart-fanen åpnes
- statiske filer og `index.html` med innholdshash

Røyktesten kjører automatisk. Feiler den, publiseres ingenting og forrige versjon blir stående.

**Viktig:** Node må være 22 (jsdom krever det). Mislykkede bygg koster ikke Netlify-kreditt; vellykkede koster 15.

## Om koden

Kildekoden ble på et tidspunkt gjenskapt fra en minifisert bygg, derfor heter mange variabler `e`, `t`, `n`, `xt` osv. og hovedkomponentene `n5`, `a5`, `s5`, `r5`, `f5`.

**Ny kode har prefikset `Ch`** og lesbare navn. Følg det mønsteret.

Nyttige holdepunkter:
- `ze` — Supabase-klienten
- `O` — fargepaletten
- `P(lang, key, vars)` — oversettelse; tekstene ligger i `_c` med `no`, `en`, `nl` (272 nøkler hver)
- `Un()` — gir `[lang, setLang]`
- `yc(landnavn)` — slår opp et land i `vc` (254 land med kode, navn, hovedstad)
- `l8(land)` — flagg-emoji
- `n5` — hovedkomponenten (innlogget app)
- `f5` — rot, pakket i `ChBoundary` (feilgrense)

### Hvordan steder identifiseres

To innsjekker er samme sted hvis de har samme `osm_id` (fast id fra OpenStreetMap). Mangler den — på eldre innsjekker — sammenlignes navn via aliaslista.

- `ChKeyOf(visit)` — identitet for et sted
- `ChCanon(sted, land)` — visningsnavn (f.eks. Prague → Praha)
- `Ch_ALIAS` — navnegrupper på tvers av språk, kun for visning

### Stedsnavn ved innsjekk

1. Nominatim slår opp stedet.
2. Bydeler rulles opp til byen (`ChRollUp`), f.eks. Grünerløkka → Oslo.
3. Postnummeret slås opp (`ChPostTown`). Tilhører det en annen by, brukes den — men bare hvis den er under 40 km unna (`ChPostOk`), og aldri hvis navnet er kommunen eller fylket.
4. Forvaltningsledd strippes (`d8`, `Wy`) og rene forvaltningsområder avvises (`ChIsAdmin`).

Regelen eieren vil ha: **eget postnummer gir eget sted.**

### Merker

Regnes ut i appen fra innsjekkene (`ChBadges`), ingenting lagres. 544 totalt, likt for alle:
- ett per land (254)
- antall land på hvert tall 1–254
- steder, hovedsteder, bragder (perfect week, serier, kontinenter, Norden, verdens høyeste/laveste/nordligste/sørligste hovedstad m.m.)

Hvilke merker brukeren har sett, lagres i `localStorage` (`ch_badges_<uid>`), så varselet bare vises for nye.

## Supabase

Prosjekt: `nmrevqsxjqtrobxqklfj` (eu-central-1)

### Tabeller

| Tabell | Innhold |
|---|---|
| `visits` | Innsjekker: `place`, `country`, `lat`, `lng`, `rating`, `comment`, `photos` (maks ett), `osm_id`, `visited_on`, `elevation`, `created_at` |
| `profiles` | `username`, `avatar_url`, `bio` (maks 180), `profile_private`, `messages_friends_only`, `seen_feed_at`, `favorite_visit_id`, `favorite_photo` |
| `friends` | `requester_id`, `addressee_id`, `status` (`pending`/`accepted`) |
| `messages` | `sender_id`, `recipient_id`, `body`, `read_at` |
| `push_subscriptions` | Én rad per enhet med varsler slått på |
| `push_queue` | Varsler som skal sendes |

### Lagring

- `visit-photos` — bilder i to størrelser: `x.jpg` (1 400 px) og `x_t.jpg` (240 px miniatyr). Lister bruker miniatyren.
- `avatars` — profilbilder

### Edge Functions

| Funksjon | Hva den gjør |
|---|---|
| `push` | Sender push-varsler fra `push_queue`. Utløses av en database-webhook ved ny rad. |
| `elevation` | Fyller inn meter over havet fra Open-Meteo for steder som mangler det. Kalles automatisk etter hver innsjekk. |
| `thumbs` | Lager miniatyrer for bilder som mangler det. Engangsjobb, kan kjøres igjen. |

VAPID-nøklene for varsler ligger som hemmeligheter i Supabase (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`). Den private nøkkelen skal aldri inn i repoet.

### Utløsere

- `ch_push_message`, `ch_push_request`, `ch_push_checkin` — legger varsler i køen
- `ch_push_queue_rydd` — sletter sendte varsler eldre enn sju dager
- `ch_elevation_ping` — ber `elevation` fylle inn høyder etter innsjekk

## Hosting og kostnader

- **Netlify**, Personal-plan (1 000 kreditter/mnd). Hver vellykket deploy koster 15.
- **Supabase**, gratisplan. 500 000 funksjonskall/mnd, 500 MB database, 1 GB lagring. Pauses etter en uke uten trafikk.

## Kjente hensyn

- **iPhone:** varsler krever at appen er lagt til på hjem-skjermen fra Safari (iOS 16.4+). Topplinjen bruker `env(safe-area-inset-top)` så knappene ikke havner under statuslinja.
- Appen kan lese andres innsjekker, men bare skrive til egne. Alt som skal fylles inn for alle brukere, må gjøres på serveren.
- Postnummer mangler ofte i OpenStreetMap for Storbritannia og Irland; da faller appen tilbake på opprullingsregelen.

## Ideer som ikke er gjort

- Kartet som trofé — besøkte land fylt inn
- Delbar profil som lenke (`/u/brukernavn`), lesbar uten innlogging
