// tools/preflight.mjs
// En snabb sanity-check innan Pages/Workers bygger.
// Fångar vanliga fel: fel mappar, saknade exports, trasig lexicon.json,
// saknade knappar i index.html, saknade lyssnare i app.js.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const fail = (msg) => {
  console.error("❌", msg);
  process.exitCode = 1;
};
const ok = (msg) => console.log("✅", msg);

const mustExist = (p) => {
  const abs = resolve(p);
  if (!existsSync(abs)) fail(`Saknas fil: ${p}`);
  else ok(`Hittad: ${p}`);
};

// 1) Kontrollera filstruktur
[
  "index.html",
  "app.js",
  "styles.css",
  "lexicon.json",
  "config.js",
  "functions/api/_utils.js",
  "functions/api/health.js",
  "functions/api/generate.js",
  "functions/api/tts.js",
  ".github/workflows/ci.yml",
].forEach(mustExist);

// 2) _utils.js exporter
try {
  const u = readFileSync("functions/api/_utils.js", "utf8");
  const hasJson = /export\s+(?:const|function)\s+json\b/.test(u);
  const hasCors = /export\s+(?:const|function)\s+corsHeaders\b/.test(u);
  if (!hasJson) fail("_utils.js exporterar inte 'json'");
  if (!hasCors) fail("_utils.js exporterar inte 'corsHeaders'");
  if (hasJson && hasCors) ok("_utils.js exports ser bra ut");
} catch (e) {
  fail(`Kunde inte läsa _utils.js: ${e.message}`);
}

// 3) Imports i API-filer
const checkImport = (file) => {
  try {
    const s = readFileSync(file, "utf8");
    if (!/from\s+["']\.\/_utils\.js["']/.test(s)) {
      fail(`${file} importerar inte från "./_utils.js"`);
    } else ok(`${file} importerar ./_utils.js`);
  } catch (e) {
    fail(`Kunde inte läsa ${file}: ${e.message}`);
  }
};
["functions/api/health.js", "functions/api/generate.js", "functions/api/tts.js"].forEach(checkImport);

// 4) lexicon.json
try {
  const raw = readFileSync("lexicon.json", "utf8");
  JSON.parse(raw);
  ok("lexicon.json är giltig JSON");
} catch (e) {
  fail(`lexicon.json ogiltig JSON: ${e.message}`);
}

// 5) index.html har knappar & script-laddning
try {
  const html = readFileSync("index.html", "utf8");
  const needIds = ["generateBtn", "listenBtn", "stopBtn"];
  needIds.forEach((id) => {
    if (!new RegExp(`id=["']${id}["']`).test(html)) {
      fail(`index.html saknar element med id="${id}"`);
    }
  });
  if (!/script[^>]+src=["']app\.js/.test(html)) {
    fail('index.html laddar inte <script src="app.js"> (med defer rekommenderat)');
  } else ok("index.html laddar app.js och har knapparna");
} catch (e) {
  fail(`Kunde inte läsa index.html: ${e.message}`);
}

// 6) app.js har lyssnare kopplade
try {
  const js = readFileSync("app.js", "utf8");
  const needHandlers = [
    "getElementById('generateBtn')",
    "getElementById('listenBtn')",
    "getElementById('stopBtn')",
  ];
  needHandlers.forEach((needle) => {
    if (!js.includes(needle)) {
      fail(`app.js saknar referens till ${needle}`);
    }
  });
  ok("app.js refererar till knapparna");
} catch (e) {
  fail(`Kunde inte läsa app.js: ${e.message}`);
}

// 7) Varning om fel mapp (utan punkt)
if (existsSync("github/workflows")) {
  fail("Felaktig mapp 'github/workflows' finns kvar (ska tas bort).");
} else {
  ok("Ingen felaktig mapp 'github/workflows' hittad");
}

// 8) Summering & exit
process.on("beforeExit", (code) => {
  if (code === 0) {
    console.log("🎉 Preflight OK – redo för deploy.");
  } else {
    console.error("🚫 Preflight FAIL – fixa ovan fel innan deploy.");
    process.exit(code);
  }
});
