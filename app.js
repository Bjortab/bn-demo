// app.js — Golden Copy v1.3 (CF Pages)
// För UI i index.html med id:n:
// level, length, voice, tempo, userIdea, output, generateBtn, listenBtn, stopBtn, audio

const $ = (q) => document.querySelector(q);

// UI-noder
const selLevel   = $("#level");
const selLength  = $("#length");
const selVoice   = $("#voice");
const rngTempo   = $("#tempo");
const txtIdea    = $("#userIdea");
const out        = $("#output");
const btnGen     = $("#generateBtn");
const btnPlay    = $("#listenBtn");
const btnStop    = $("#stopBtn");
const audioEl    = $("#audio");

// API-bas (samma origin)
const BASE = `${location.origin}/api`;

let busyGen = false;
let busyTts = false;

// ———————————————————————————————————————
// Hjälpfunktioner

function setBusy(gen = false) {
  busyGen = !!gen;
  btnGen.disabled = busyGen;
  btnPlay.disabled = busyGen || busyTts;
  btnStop.disabled = false;
}

function setAudioBusy(tts = false) {
  busyTts = !!tts;
  btnPlay.disabled = busyGen || busyTts;
  btnStop.disabled = !busyTts && !busyGen;
}

function setStatus(text) {
  out.textContent = text;
}

function appendStatus(line) {
  const now = new Date().toLocaleTimeString();
  out.textContent += `\n[${now}] ${line}`;
}

async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/health`);
    const js = await res.json().catch(() => ({}));
    const ok = !!js.ok;
    appendStatus(ok ? "API: ok" : "API: fel");
  } catch {
    appendStatus("API: fel (health)");
  }
}
checkHealth();

// ———————————————————————————————————————
// Generera berättelse

function minutesFromUI() {
  // length innehåller 5|10|15 (minuter)
  const val = Number(selLength.value || 5);
  return Math.max(1, Math.min(30, val));
}

async function generate() {
  if (busyGen) return;
  const idea = (txtIdea.value || "").trim();
  const level = Number(selLevel.value || 3);
  const minutes = minutesFromUI();

  // enkel guard
  if (!idea) {
    setStatus("(ange en idé)");
    return;
  }

  setBusy(true);
  setStatus("Genererar…");

  // ”spinn”-indikator
  let dots = 0;
  const spin = setInterval(() => {
    dots = (dots + 1) % 4;
    const d = ".".repeat(dots);
    out.textContent = `Genererar${d}`;
  }, 600);

  try {
    const res = await fetch(`${BASE}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea, level, minutes })
    });

    clearInterval(spin);

    // Om backend mot förmodan råkar returnera HTML (fel), parsa inte som JSON direkt
    const raw = await res.text();
    let data = {};
    try { data = JSON.parse(raw); } catch {
      throw new Error(`HTTP ${res.status}; ej JSON`);
    }

    if (!res.ok || !data.ok) {
      const detail = data?.error ? `: ${data.error}` : "";
      throw new Error(`Fel vid generering${detail}`);
    }

    const story = data.text || "";
    if (!story) throw new Error("Tomt svar");

    // fyll ut
    out.textContent = story;

  } catch (err) {
    clearInterval(spin);
    setStatus(`(fel vid generering)`);
    console.error("generate error:", err);
    appendStatus(String(err.message || err));
  } finally {
    setBusy(false);
  }
}

// ———————————————————————————————————————
// TTS

async function ttsPlay() {
  if (busyTts) return;
  const text = (out.textContent || "").trim();
  if (!text) {
    setStatus("(ingen text att läsa)");
    return;
  }
  setAudioBusy(true);
  appendStatus("Hämtar röst …");

  const voice = selVoice.value || "alloy";
  const tempo = Number(rngTempo.value || 1.0);

  try {
    const res = await fetch(`${BASE}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, voice, rate: tempo })
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      throw new Error(`TTS fel ${res.status} – ${raw.slice(0, 160)}`);
    }

    // TTS vägen är Audio/mp3-binary
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    audioEl.src = url;
    await audioEl.play().catch(() => { /* tyst */ });
    appendStatus("Spelar upp…");
    audioEl.onended = () => {
      setAudioBusy(false);
      appendStatus("Uppläsning klar.");
      URL.revokeObjectURL(url);
    };
  } catch (e) {
    setAudioBusy(false);
    appendStatus("TTS fel.");
    console.error("tts error:", e);
  }
}

function ttsStop() {
  try {
    audioEl.pause();
    audioEl.currentTime = 0;
  } catch {}
  setAudioBusy(false);
  appendStatus("Stopp.");
}

// ———————————————————————————————————————
// Bind knappar

btnGen?.addEventListener("click", generate);
btnPlay?.addEventListener("click", ttsPlay);
btnStop?.addEventListener("click", ttsStop);

// Init-status
appendStatus(`BN front v1.3 (Cloudflare)`);
