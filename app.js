// app.js — BN front GC v1.4
// - Stabil generate/tts-flöde
// - Tydliga statusar, spinner
// - Nivåstyrda stilhintar (nivå 4=het, nivå 5=explicit) injiceras i idea
// - Kräver inga ändringar i index.html/styles.css/backend

const $ = (q) => document.querySelector(q);

// UI-element (behåll samma IDs som du redan har)
const $level  = $("#level");       // <select> 1..5
const $length = $("#length");      // <select> 5/10/15 eller radio-grupp name="length"
const $voice  = $("#voice");       // "verse"(kvinnlig)/"coral"(man)/"alloy"(neutral) el. liknande
const $tempo  = $("#tempo");       // 0.8–1.25
const $idea   = $("#userIdea");

const $output = $("#output");      // <pre> eller <div>
const $btnGen = $("#generateBtn");
const $btnPlay= $("#listenBtn");
const $btnStop= $("#stopBtn");
const $audio  = $("#audio");

const BASE = location.origin + "/api";

let busyGen = false;
let busyTts = false;

// ——— Hjälpare UI ———
function now() { return new Date().toLocaleTimeString(); }
function setStatus(msg) {
  const lines = ($output.textContent || "").trim();
  const line  = `[${now()}] ${msg}`;
  $output.textContent = lines ? `${lines}\n${line}` : line;
}
function setText(text) { $output.textContent = text; }
function clearAudio() {
  try { $audio.pause(); } catch {}
  try { URL.revokeObjectURL($audio.src); } catch {}
  $audio.src = "";
}
function setBusy(gen=false, tts=false) {
  busyGen = !!gen; busyTts = !!tts;
  $btnGen.disabled  = busyGen || busyTts;
  $btnPlay.disabled = busyGen || busyTts || !($output.textContent||"").trim();
  $btnStop.disabled = !busyTts && !$audio.src;
}
async function checkHealth() {
  try {
    const r = await fetch(`${BASE}/health`, { cache: "no-store" });
    const data = await r.json().catch(()=>({}));
    setStatus(data?.ok ? "API: ok" : "API: fel");
  } catch { setStatus("API: fel"); }
}
checkHealth();

function getLevel() {
  return Math.max(1, Math.min(5, Number($level?.value || 3)));
}
function getMinutes() {
  const radio = document.querySelector('input[name="length"]:checked');
  const v = radio ? radio.value : ($length?.value || 5);
  const n = Number(v || 5);
  return Math.max(1, Math.min(30, n));
}
function getVoice() { return ($voice?.value || "verse"); }
function getTempo() { return Math.max(0.8, Math.min(1.25, Number($tempo?.value || 1.0))); }

function spinner(start=true) {
  let dots = 0, id;
  if (!start) return () => {};
  id = setInterval(() => {
    dots = (dots + 1) % 4;
    const base = "Genererar";
    const lines = ($output.textContent || "").split("\n");
    if (lines.length === 0 || !lines[lines.length-1].startsWith("["))
      lines.push(base + ".".repeat(dots));
    else
      lines[lines.length-1] = `[${now()}] ${base}${".".repeat(dots)}`;
    $output.textContent = lines.join("\n");
  }, 600);
  return () => clearInterval(id);
}

// ——— Nivå-hintar (front-end lexikon kompakt) ———
// Vi injicerar stilhintar för att förstärka nivåskillnad utan backendändringar.
const L4_HINT = [
  "lem", "vagina", "våt mellan låren", "skälvde av lust", "hans händer utforskade",
  "trängde in långsamt", "rytmisk takt", "kunde inte hålla tillbaka", "klimax", "heta kyssar",
  "stönade mjukt", "hennes kropp svarade", "hans läppar mot halsen", "värme mellan oss",
  "pressade mig närmare", "bröst mot bröst", "bådade om mer", "intensivt men stilfullt",
  "svensk idiomatisk ton", "varierat språk utan upprepning"
];

const L5_HINT = [
  "explicit vuxen ton", "kuk", "fitta", "knulla", "spruta",
  "slickade hennes klitoris", "bakifrån", "ansiktssprut", "djupa stötar",
  "svalde allt", "red honom hårt", "kom i hennes mun", "körde i röven",
  "höll henne hårt", "skrek av njutning", "utan omskrivningar", "idiomatisk svenska",
  "varierad rytm och tempo", "inga upprepningar", "avrunda tydligt"
];

function buildIdeaWithHints(userIdea, level, minutes) {
  const base = String(userIdea||"").trim();
  if (level <= 3) return base; // snäll/sensuell – inga extra hintar behövs

  // Välj ett gäng hintar (slumpa för variation)
  const pool = (level === 4) ? L4_HINT : L5_HINT;
  const count = Math.min(8, pool.length);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, count);

  const header = (level === 4)
    ? "Stilhintar nivå 4 (het, stilfullt vuxet språk, svenska ordval):"
    : "Stilhintar nivå 5 (explicit vuxen ton, idiomatisk svenska, utan omskrivningar):";

  // Vi lägger dem i en liten “guidelines”-sektion längst ned i idén
  return [
    base,
    "",
    header,
    "• Använd sparsamt och organiskt. Undvik upprepningar.",
    "• Variera tempo (lugn uppbyggnad → intensiv scen → tydlig avrundning).",
    "• Fras/ord att kunna väva in:",
    picked.map(s => `  - ${s}`).join("\n")
  ].filter(Boolean).join("\n");
}

// ——— GENERERA ———
async function generate() {
  if (busyGen || busyTts) return;

  const ideaRaw = ($idea?.value || "").trim();
  const level   = getLevel();
  const minutes = getMinutes();

  if (!ideaRaw) { setStatus("Ange en idé först."); return; }

  // injicera nivå-hintar i idea
  const idea = buildIdeaWithHints(ideaRaw, level, minutes);

  clearAudio();
  setText("");
  setStatus("Genererar …");
  setBusy(true, false);
  const stopSpin = spinner(true);

  let res, raw, ct;
  try {
    res = await fetch(`${BASE}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea, level, minutes })
    });
  } catch (e) {
    stopSpin(); setBusy(false, false);
    setStatus("Nätverksfel vid generering."); console.error("[BN] fetch /generate", e);
    return;
  }

  try {
    ct = res.headers.get("content-type") || "";
    raw = await res.text();

    if (!res.ok) {
      stopSpin(); setBusy(false, false);
      if (!ct.includes("application/json")) {
        setStatus(`Serverfel ${res.status}`);
        console.error("[BN] /generate non-JSON error:", raw.slice(0, 800));
        return;
      }
      let data={}; try { data = JSON.parse(raw); } catch {}
      setStatus(`Fel vid generering: ${data?.error || res.status}`);
      console.error("[BN] /generate JSON error:", data);
      return;
    }

    if (!ct.includes("application/json")) {
      stopSpin(); setBusy(false, false);
      setStatus("Oväntat svar (ej JSON) från servern.");
      console.error("[BN] /generate raw non-JSON:", raw.slice(0, 800));
      return;
    }

    let data; try { data = JSON.parse(raw); } catch {
      stopSpin(); setBusy(false, false);
      setStatus("Felaktig JSON från servern.");
      console.error("[BN] /generate parse fail:", raw.slice(0, 800));
      return;
    }

    if (!data.ok) {
      stopSpin(); setBusy(false, false);
      setStatus(`Fel vid generering: ${data?.error || "okänt"}`);
      console.error("[BN] /generate not ok:", data);
      return;
    }

    const story = (data.text || "").trim();
    if (!story) {
      stopSpin(); setBusy(false, false);
      setStatus("Tomt svar.");
      return;
    }

    // Visa text
    stopSpin();
    setText(story);
    setStatus("Hämtar röst …");
    setBusy(false, true);

    // Server-TTS
    const vr = await fetch(`${BASE}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: story, voice: getVoice(), tempo: getTempo() })
    });

    if (vr.ok) {
      const blob = await vr.blob();
      const url  = URL.createObjectURL(blob);
      $audio.src = url;
      try { await $audio.play(); } catch {}
      setBusy(false, false);
      setStatus("Spelar (server-TTS).");
      return;
    }

    // Fallback: Browser TTS
    let info = {};
    try { info = await vr.json(); } catch {}
    console.warn("[BN] TTS server fail:", info);
    setStatus("Röst: fallback (webbläsare).");
    await speakWithBrowserTTS(story, getVoice(), getTempo());
    setBusy(false, false);

  } catch (e) {
    stopSpin(); setBusy(false, false);
    setStatus("Fel i hantering av generering.");
    console.error("[BN] generate handle error:", e);
  }
}

// ——— SPELA UPP ———
async function replay() {
  if (busyGen || busyTts) return;
  const text = ($output.textContent || "").trim();
  if (!text) return;

  setBusy(false, true);

  if ($audio.src) {
    try { $audio.currentTime = 0; await $audio.play(); setStatus("Spelar (server-TTS)."); }
    catch { /* fallthrough */ }
    setBusy(false, false);
    return;
  }

  await speakWithBrowserTTS(text, getVoice(), getTempo());
  setBusy(false, false);
}

function stopAll() {
  try { speechSynthesis.cancel(); } catch {}
  try { $audio.pause(); } catch {}
  setStatus("Stopp.");
  setBusy(false, false);
}

// ——— Browser-TTS fallback ———
async function speakWithBrowserTTS(text, voiceKey, tempo) {
  return new Promise((resolve) => {
    if (typeof window.speechSynthesis === "undefined") {
      setStatus("Webbläsaren har ingen inbyggd TTS."); return resolve();
    }
    const u = new SpeechSynthesisUtterance(String(text||""));
    u.lang = "sv-SE";

    const wantFemale = (voiceKey === "verse");
    const wantMale   = (voiceKey === "coral");
    const voices = speechSynthesis.getVoices();
    let v = voices.find(v => v.lang?.toLowerCase().startsWith("sv") && (
      wantFemale ? /female|kvin|Astrid|Alva|Svenska/i.test(v.name) :
      wantMale   ? /male|man|Erik|Hugo|Svenska/i.test(v.name) : true
    )) || voices.find(v => v.lang?.toLowerCase().startsWith("sv")) || voices[0];
    if (v) u.voice = v;

    const rate = Math.max(0.9, Math.min(1.15, 0.9 + (Number(tempo||1)-1)*0.5));
    u.rate  = rate;
    u.pitch = wantFemale ? 1.05 : wantMale ? 0.95 : 1.0;

    u.onend = () => { setStatus("Klar (webbläsare)."); resolve(); };
    u.onerror = () => { setStatus("Fel i webbläsar-röst."); resolve(); };

    try { speechSynthesis.cancel(); } catch {}
    try { speechSynthesis.speak(u); } catch { resolve(); }
  });
}

// ——— Bind ———
$btnGen?.addEventListener("click", generate);
$btnPlay?.addEventListener("click", replay);
$btnStop?.addEventListener("click", stopAll);

// Start
setStatus("BN front laddad (v1.4).");
