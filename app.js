// app.js — GC v1.3.2 (Cloudflare)  — sekventiell TTS-uppspelning
const $ = (q) => document.querySelector(q);

// UI
const $level    = $("#level");
const $length   = $("#length");
const $voice    = $("#voice");
const $tempo    = $("#tempo");
const $idea     = $("#userIdea");
const $out      = $("#output");
const $story    = $("#story");
const $btnGen   = $("#generateBtn");
const $btnPlay  = $("#listenBtn");
const $btnStop  = $("#stopBtn");
const $audioElt = $("#audio");

// API bas (samma origin)
const BASE = location.origin + "/api";

let busyGen = false;
let busyTts = false;
let cancelled = false;

// ——— UI helpers ———
function setBusy() {
  $btnGen.disabled = busyGen || busyTts;
  $btnPlay.disabled = busyGen || busyTts;
  $btnStop.disabled = !busyGen && !busyTts;
}

function setStatus(text = "") {
  $out.textContent = text;
}

function appendStatus(line) {
  const now = new Date().toTimeString().slice(0, 8);
  $out.textContent = `[${now}] ${line}\n` + $out.textContent;
}

// Hälso-check
async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/health`);
    const ok = res.ok;
    if (ok) appendStatus("API: ok");
    else appendStatus(`API: fel (status ${res.status})`);
  } catch {
    appendStatus("API: fel (health)");
  }
}
checkHealth();

// ——— Prompt byggare (samma som tidigare) ———
function invs(levelStr) {
  const m = String(levelStr || "").match(/\d/);
  return m ? Number(m[0]) : 3;
}

function buildUserPrompt() {
  const lvl = invs($level.value);
  const minutes = Number($length.value || 5);
  const idea = ($idea.value || "").trim();

  // Använd samma guide som du har i generate.js
  return {
    level: lvl,
    minutes,
    idea
  };
}

// ——— Generera ———
async function generate() {
  cancelled = false;
  busyGen = true; setBusy();
  try {
    setStatus("Genererar…");
    const payload = buildUserPrompt();

    const res = await fetch(`${BASE}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch {
      appendStatus("Fel vid generering: tomt eller icke-JSON svar");
      return;
    }

    if (!res.ok || !data.ok) {
      appendStatus(`Fel vid generering: ${data.provider || ""}${data.status ? "_" + data.status : ""} ${data.error || ""}`);
      return;
    }

    const story = (data.story || "").trim();
    if (!story) {
      appendStatus("Tom berättelse");
      return;
    }

    $story.textContent = story;
    setStatus("(klart)\n\nHämtar röst…");
    await doTTS(story);
  } catch (err) {
    appendStatus(`generate error: ${err?.message || err}`);
  } finally {
    busyGen = false; setBusy();
  }
}

// ——— TTS ———
// Spela upp en lista av data-URLer i följd, i den takt användaren valt
async function doTTS(text) {
  busyTts = true; setBusy();
  try {
    const tempo = Number($tempo.value || 1.0);
    const voice = $voice.value || "alloy";

    // 1) Hämta tts-delar
    const res = await fetch(`${BASE}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      appendStatus(`TTS-fel: ${data.error || res.status}`);
      return;
    }

    const parts = Array.isArray(data.parts) ? data.parts : [];
    if (!parts.length) {
      appendStatus("TTS-fel: inga delar");
      return;
    }

    appendStatus(`Spelar ${parts.length} del(ar)…`);

    // 2) Spela upp sekventiellt
    for (let i = 0; i < parts.length; i++) {
      if (cancelled) break;
      setStatus(`(spelar del ${i+1}/${parts.length})`);
      await playOne(parts[i], tempo);
    }
    setStatus("(uppspelning klar)");
  } catch (err) {
    appendStatus(`TTS-fel: ${err?.message || err}`);
  } finally {
    busyTts = false; setBusy();
  }
}

function playOne(src, tempo = 1.0) {
  return new Promise((resolve, reject) => {
    try {
      $audioElt.src = src;
      $audioElt.playbackRate = tempo || 1.0;
      $audioElt.onended = () => resolve();
      $audioElt.onerror = () => reject(new Error("audio error"));
      $audioElt.play().catch(reject);
    } catch (e) { reject(e); }
  });
}

// ——— knappar ———
$btnGen?.addEventListener("click", () => {
  if (busyGen || busyTts) return;
  generate();
});

$btnPlay?.addEventListener("click", () => {
  const text = ($story.textContent || "").trim();
  if (!text) return;
  doTTS(text);
});

$btnStop?.addEventListener("click", () => {
  cancelled = true;
  try { $audioElt.pause(); } catch {}
  busyGen = false; busyTts = false; setBusy();
  setStatus("(stoppad)");
});
