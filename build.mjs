// Bygger CityHopper: bunter src/app.js og kopierer de statiske filene til dist/.
// Versjonslappen i index.html settes automatisk fra innholdet i app.js,
// så telefonen aldri viser en gammel mellomlagret versjon.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";

const STATIC = ["sw.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["app.source.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: "dist/app.js",
});

await new Promise((ok, no) => {
  const t = spawn(process.execPath, ["smoke.mjs"], { stdio: "inherit" });
  t.on("exit", (code) => (code === 0 ? ok() : no(new Error("Røyktesten feilet — publiserer ikke."))));
});

const bundle = await readFile("dist/app.js");
const version = createHash("sha256").update(bundle).digest("hex").slice(0, 10);

const html = await readFile("index.html", "utf8");
const patched = html.replace(/app\.js(\?v=[^"']*)?/g, `app.js?v=${version}`);
if (patched === html && !html.includes("app.js")) {
  throw new Error("Fant ikke app.js-referansen i index.html");
}
await writeFile("dist/index.html", patched);

for (const f of STATIC) await copyFile(f, `dist/${f}`);

console.log(`Bygget ferdig. Versjon ${version}, ${(bundle.length / 1024).toFixed(0)} kB.`);
