import fs from "node:fs";

function mustExist(path) {
  if (!fs.existsSync(path)) throw new Error("Missing file: " + path);
}

function has(str, pat, label) {
  if (!pat.test(str)) throw new Error("Check failed: " + label);
}

console.log("Preflight: start");

// 1) Struktur
["index.html","app.js","styles.css","lexicon.json",
 "functions/api/_utils.js","functions/api/health.js",
 "functions/api/generate.js","functions/api/tts.js"].forEach(mustExist);

// 2) Utils exports
const utils = fs.readFileSync("functions/api/_utils.js", "utf8");
has(utils, /export function jsonResponse/, "utils.jsonResponse");
has(utils, /export function corsHeaders/, "utils.corsHeaders");

// 3) health imports rätt
const health = fs.readFileSync("functions/api/health.js", "utf8");
has(health, /from "\.\/_utils\.js"/, "health imports ./_utils.js");
has(health, /jsonResponse/, "health uses jsonResponse");

// 4) index knappar & script
const html = fs.readFileSync("index.html", "utf8");
["generateBtn","listenBtn","stopBtn","useridea","voice","tempo","output"]
  .forEach(id => has(html, new RegExp(`id=["']${id}["']`), `index has #${id}`));
has(html, /app\.js/, "index loads app.js");

// 5) lexikon är giltig JSON
JSON.parse(fs.readFileSync("lexicon.json","utf8"));

console.log("Preflight: OK");
