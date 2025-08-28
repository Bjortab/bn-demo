// app.js — BN front GC v1.3.3 (matchar generate.js GC v2.3.1)
// - Robust JSON-hantering (tål HTML-felsidor)
// - Tydliga statusrader i UI
// - TTS: server först (/api/tts), fallback till webbläsarens röst
// - Inga ändringar krävs i index.html/styles.css (förutsätter samma element-ID:n)

const $ = (q) => document.querySelector(q);

// UI-element (förutsätter samma ID som tidigare)
const $level  = $("#level");           // <select> 1..5
const $length = $("#length");          // kan vara <select> eller radio-grupp
const $voice  = $("#voice");           // t.ex. verse (kvinnlig), coral (man), alloy (neutral)
const $tempo  = $("#tempo");           // 0.8–1.25 rekommenderat
const $idea   = $("#userIdea");        // fri text

const $output = $("#output");          // <pre> eller <div> där texten visas
const $btnGen = $("#generateBtn");
const $btnPlay= $("#listenBtn");
const $btnStop= $("#stopBtn");
const $audio  = $("#audio");           // <audio>

const BASE = location.origin + "/api";

let busyGen = false;
let busyTts = false;

function now() {
  return new Date().toLocaleTimeString();
}
function setStatus(msg) {
  // skriver status överst och behåller ev. text
  const txt = $output.textContent?.trim() || "";
  const line = `[${now()}] ${msg}`;
  $output.textContent = txt ? `${txt}\n${line}` : line;
}
function setText(text) {
  $output.textContent = text;
}
function clearAudio() {
  try { $audio.pause(); } catch {}
  try { URL.revokeObjectURL($audio.src); } catch {}
  $audio.src = "";
}
function setBusy(gen=false, tts=false) {
  busyGen = !!gen;
  busyTts = !!tts;
  $btnGen.disabled  = busyGen || busyTts;
  $btnPlay.disabled = busyGen || busyTts;
  $btnStop.disabled = !busyTts && !$audio.src;
}

async function checkHealth() {
  try {
    const r = await fetch(`${BASE}/health`);
    const ok = (await r.json()).ok;
    setStatus(ok ? "API: ok" : "API: fel");
  } catch {
    setStatus("API: fel");
  }
}
checkHealth();

function getLevel() {
  return Number($level?.value || 3);
}
function getMinutes() {
  // Stöd både <select id="length"> och en radio-grupp name="length"
  const radioChecked = document.querySelector('input[name="length"]:checked');
  const val = radioChecked ? radioChecked.value : ($length?.value || 5);
  const n = Number(val || 5);
  return Math.max(1, Math.min(30, n));
}
function getVoice() {
  return ($voice?.value || "verse"); // default kvinnlig
}
function getTempo() {
  const t = Number($tempo?.value || 1.0);
  return Math.max(0.8, Math.min(1.25, t));
}

function spinner(start=true) {
  let dots = 0, id;
  if (!start) return () => {};
  id = setInterval(() => {
    dots = (dots + 1) % 4;
    const base = ($output.textContent || "").split("\n")[0] || "Genererar";
    const lines = $output.textContent.split("\n");
    lines[lines.length - 1] = `${base}${".".repeat(dots)}`;
    $output.textContent = lines.join("\n");
  }, 600);
  return () => clearInterval(id);
}

// ——— GENERATE ———
async function generate() {
  if (busyGen || busyTts) return;
  const idea = ($idea?.value || "").trim();
  const level = getLevel();
  const minutes = getMinutes();

  if (!idea) {
    setStatus("Ange en idé först.");
    return;
  }

  clearAudio();
  setText("");
  setStatus("Genererar …");
  setBusy(true, false);
  const stopSpin = spinner(true);

  // Skicka request
  let res, raw, ct;
  try {
    res = await fetch(`${BASE}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea, level, minutes })
    });
  } catch (e) {
    stopSpin();
    setBusy(false, false);
    setStatus("Nätverksfel vid generering.");
    console.error("[BN] fetch /generate error", e);
    return;
  }

  try {
    ct = res.headers.get("content-type") || "";
    raw = await res.text();

    if (!res.ok) {
      // Serverfel
      stopSpin();
      setBusy(false, false);
      if (!ct.includes("application/json")) {
        setStatus(`Serverfel ${res.status}`);
        console.error("[BN] /generate non-JSON error:", raw.slice(0, 800));
        return;
      }
      let data = {};
      try { data = JSON.parse(raw); } catch {}
      setStatus(`Fel vid generering: ${data?.error || res.status}`);
      console.error("[BN] /generate error JSON:", data);
      return;
    }

    if (!ct.includes("application/json")) {
      stopSpin();
      setBusy(false, false);
      setStatus("Oväntat svar (ej JSON) från servern.");
      console.error("[BN] /generate raw non-JSON:", raw.slice(0, 800));
      return;
    }

    let data;
    try { data = JSON.parse(raw); } catch (e) {
      stopSpin();
      setBusy(false, false);
      setStatus("Felaktig JSON från servern.");
      console.error("[BN] /generate JSON parse error, raw:", raw.slice(0, 800));
      return;
    }

    if (!data.ok) {
      stopSpin();
      setBusy(false, false);
      setStatus(`Fel vid generering: ${data?.error || "okänt"}`);
      console.error("[BN] /generate data not ok:", data);
      return;
    }

    const story = (data.text || "").trim();
    if (!story) {
      stopSpin();
      setBusy(false, false);
      setStatus("Tomt svar.");
      return;
    }

    // Visa berättelsen
    stopSpin();
    setText(story);
    setStatus("Hämtar röst …");
    setBusy(false, true);

    // Server-TTS
    const vr = await fetch(`${BASE}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: story,
        voice: getVoice(),
        tempo: getTempo()
      })
    });

    if (vr.ok) {
      const blob = await vr.blob();
      const url = URL.createObjectURL(blob);
      $audio.src = url;
      try { await $audio.play(); } catch {}
      setBusy(false, false);
      setStatus("Spelar (server-TTS).");
      return;
    }

    // Server-TTS misslyckades → fallback till browser-TTS
    let info = {};
    try { info = await vr.json(); } catch {}
    console.warn("[BN] TTS server fail:", info);
    setStatus("Röst: fallback (webbläsare).");
    await speakWithBrowserTTS(story, getVoice(), getTempo());
    setBusy(false, false);

  } catch (e) {
    stopSpin();
    setBusy(false, false);
    setStatus("Fel i hantering av generering.");
    console.error("[BN] generate handle error:", e);
  }
}

// ——— LISTEN ———
async function replay() {
  if (busyGen || busyTts) return;
  const text = ($output.textContent || "").trim();
  if (!text) return;

  setBusy(false, true);

  // Försök spela om server-mp3 om vi har en
  if ($audio.src) {
    try { $audio.currentTime = 0; await $audio.play(); setStatus("Spelar (server-TTS)."); }
    catch { /* fallthrough till browser-TTS */ }
    setBusy(false, false);
    return;
  }

  // Annars: browser-TTS
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
      setStatus("Webbläsaren har ingen inbyggd TTS.");
      return resolve();
    }
    const u = new SpeechSynthesisUtterance(String(text || ""));
    u.lang = "sv-SE";

    // röstval (heuristik)
    const wantFemale = (voiceKey === "verse");
    const wantMale   = (voiceKey === "coral");
    const voices = speechSynthesis.getVoices();
    let v = voices.find(v => v.lang?.toLowerCase().startsWith("sv") && (
      wantFemale ? /female|kvin|Astrid|Alva|Svenska/i.test(v.name) :
      wantMale   ? /male|man|Erik|Hugo|Svenska/i.test(v.name) : true
    )) || voices.find(v => v.lang?.toLowerCase().startsWith("sv")) || voices[0];
    if (v) u.voice = v;

    // tempo/pitch
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

// Startmeddelande
setStatus("BN front laddad.");
