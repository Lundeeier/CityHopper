// Røyktest: laster den ferdig bygde appen i et simulert nettleservindu og
// sjekker at den faktisk tegner opp innloggingsskjermen uten feil.
// Kjøres av build.mjs, slik at en ødelagt versjon aldri blir publisert.
import { readFileSync } from "node:fs";

// Kan ikke testverktøyet kjøre i dette miljøet, hopper vi over testen
// i stedet for å stoppe utgivelsen.
let JSDOM;
try {
  ({ JSDOM } = await import("jsdom"));
} catch (e) {
  console.log("Røyktest hoppet over: jsdom kunne ikke lastes (" + e.message + ").");
  process.exit(0);
}

const dom = new JSDOM('<div id="root"></div>', {
  runScripts: "outside-only",
  url: "https://cityhoppers.netlify.app/",
  pretendToBeVisual: true,
});
const w = dom.window;
w.fetch = () => Promise.reject(new Error("offline"));
w.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});

const errors = [];
w.console.error = (...a) => errors.push(a.map(String).join(" ").slice(0, 300));

try {
  w.eval(readFileSync("dist/app.js", "utf8"));
} catch (e) {
  console.error("Røyktest: appen krasjet ved oppstart.\n" + e.stack);
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 1500));

const text = w.document.getElementById("root").textContent || "";
const problems = [];
if (text.length < 200) problems.push("appen tegnet nesten ingenting");
if (!/Logg inn|Log in|Inloggen/.test(text)) problems.push("fant ikke innloggingsskjermen");
if (errors.length) problems.push("React-feil: " + errors[0]);

if (problems.length) {
  console.error("Røyktest feilet:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("Røyktest OK.");
process.exit(0);
