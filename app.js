// app.js — BN front GC v1.4.2
// - Använder SSML från /api/generate (bättre pauser/flow i rösten)
// - Tydliga UI-statusar: Genererar → Hämtar röst → Spelar/Klar
// - Robust JSON-hantering (tål HTML-fel), spinner, disable/enable knappar
// - Fallback: server-TTS → webbläsar-TTS om servern faller
// - Kräver inga ändringar i index.html/styles.css (förutsätter samma element-ID:n)

const $ = (q) => document.querySelector(q);

// UI-element (behåll samma IDs i HTML)
const $level   = $("#level");       // <select> 1..5
const $length  = $("#length");      // <select> 5/10/15 eller radio-grupp name="length"
const $voice   = $("#voice");       // verse/coral/alloy etc.
const $tempo   = $("#tempo");       // 0.8–1.25
const $idea    = $("#userIdea");    // fri text

const $output  = $("#output");      // <pre> eller <div> för text/status
const $btnGen  = $("#generateBtn");
const $btnPlay = $("#listenBtn");
const $btnStop = $("#stopBtn");
const $audio   = $("#audio");

const BASE = location.origin + "/api";

let busyGen = false;
let busyTts = false;

// ——— helpers ———
function now() { return new Date().toLocaleTimeString(); }
function setText(t) { $output.textContent = t || ""; }
function appendStatus(msg) {
  const prev = ($output.textContent || "").trim();
  const line = `[${now()}] ${msg}`;
  $output.textContent = prev ? `${prev}\n${line}` : line;
}
function clearAudio() {
  try { $audio.pause(); } catch {}
  try { URL.revokeObjectURL($audio.src); } catch {}
  $audio.src = "";
}
function setBusy(gen=false, tts=false) {
  busyGen = !!gen; busyTts = !!tts;
  $btnGen.disabled  = busyGen || busyTts;
  $btnPlay.disabled = busyGen || busyTts || !($output.dataset.story || "");
  $btnStop.disabled = !busyTts && !$audio.src;
}
function spinner(start=true) {
  let dots = 0, id;
  if (!start) return () => {};
  id = setInterval(() => {
    dots = (dots + 1) % 4;
    const lines = ($output.textContent || "").split("\n");
    const lastIsStatus = lines.length && /^\[\d{1,2}:\d{2}:\d{2}/.test(lines[lines.length-1]);
    const base = "Genererar";
    if (!lines.length || lastIsStatus) lines.push(`${base}${".".repeat(dots)}`);
    else lines[lines.length-1] = `${base}${".".repeat(dots)}`;
    $output.textContent = lines.join("\n");
  }, 600);
  return () => clearInterval(id);
}
function getLevel(){ return Math.max(1, Math.min(5, Number($level?.value || 3))); }
function getMinutes(){
  const radio = document.querySelector('input[name="length"]:checked');
  const v = radio ? radio.value : ($length?.value || 5);
  return Math.max(1, Math.min(30, Number(v || 5)));
}
function getVoice(){ return ($voice?.value || "verse"); }
function getTempo(){ return Math.max(0.8, Math.min(1.25, Number($tempo?.value || 1.0))); }

async function checkHealth(){
  try {
    const r = await fetch(`${BASE}/health`, { cache: "no-store" });
    const d = await r.json().catch(()=>({}));
    appendStatus(d?.ok ? "API: ok" : "API: fel");
  } catch { appendStatus("API: fel"); }
}
checkHealth();

// ——— main actions ———
async function generate() {
  if (busyGen || busyTts) return;

  const idea = ($idea?.value || "").trim();
  const level = getLevel();
  const minutes = getMinutes();
  if (!idea) { appendStatus("Ange en idé först."); return; }

  // reset
  $output.dataset.story = "";
  $output.dataset.ssml  = "";
  clearAudio();
  setText("");
  appendStatus("Genererar …");
  setBusy(true, false);
  const stopSpin = spinner(true);

  // call /api/generate
  let res, raw, ct;
  try {
    res = await fetch(`${BASE}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea, level, minutes })
    });
  } catch (e) {
    stopSpin(); setBusy(false, false);
    appendStatus("Nätverksfel vid generering."); console.error("[BN] fetch /generate fail", e);
    return;
  }

  try {
    ct = res.headers.get("content-type") || "";
    raw = await res.text();

    if (!res.ok) {
      stopSpin(); setBusy(false, false);
      if (!ct.includes("application/json")) {
        appendStatus(`Serverfel ${res.status}`); console.error("[BN] /generate non-JSON:", raw.slice(0,800));
        return;
      }
      let data = {}; try { data = JSON.parse(raw); } catch {}
      appendStatus(`Fel vid generering: ${data?.error || res.status}`);
      console.error("[BN] /generate JSON-error:", data);
      return;
    }

    if (!ct.includes("application/json")) {
      stopSpin(); setBusy(false, false);
      appendStatus("Oväntat svar (ej JSON) från servern.");
      console.error("[BN] /generate raw non-JSON:", raw.slice(0,800));
      return;
    }

    let data; try { data = JSON.parse(raw); } catch {
      stopSpin(); setBusy(false, false);
      appendStatus("Felaktig JSON från servern."); console.error("[BN] parse fail:", raw.slice(0,800));
      return;
    }

    if (!data.ok) {
      stopSpin(); setBusy(false, false);
      appendStatus(`Fel vid generering: ${data?.error || "okänt"}`);
      console.error("[BN] /generate not ok:", data);
      return;
    }

    const story = (data.story || data.text || "").trim();
    const ssml  = (data.ssml || "").trim();
    if (!story && !ssml) {
      stopSpin(); setBusy(false, false);
      appendStatus("Tomt svar.");
      return;
    }

    // spara och visa
    $output.dataset.story = story;
    $output.dataset.ssml  = ssml;
    stopSpin();

    // visa texten i rutan
    setText(story || "(SSML tillgängligt)");
    appendStatus("Hämtar röst …");
    setBusy(false, true);

    // server TTS (prioritera SSML om finns)
    const ttsBody = {
      text: ssml || story || "",
      voice: getVoice(),
      tempo: getTempo(),
      ssml: Boolean(ssml)  // flagga till backend att texten kunde vara SSML
    };

    const vr = await fetch(`${BASE}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ttsBody)
    });

    if (vr.ok) {
      const blob = await vr.blob();
      const url  = URL.createObjectURL(blob);
      $audio.src = url;
      try { await $audio.play(); appendStatus("Spelar (server-TTS)."); }
      catch { appendStatus("Klar (server-TTS)."); }
      setBusy(false, false);
      return;
    }

    // fallback → browser TTS
    let info = {}; try { info = await vr.json(); } catch {}
    console.warn("[BN] TTS server fail:", info);
    appendStatus("Röst: fallback (webbläsare).");
    await speakWithBrowserTTS(story || "", getVoice(), getTempo());
    setBusy(false, false);

  } catch (e) {
    stopSpin(); setBusy(false, false);
    appendStatus("Fel i hantering av generering."); console.error("[BN] generate handle error:", e);
  }
}

async function replay() {
  if (busyGen || busyTts) return;
  const story = ($output.dataset.story || "").trim();
  const ssml  = ($output.dataset.ssml  || "").trim();
  if (!story && !ssml) return;

  setBusy(false, true);

  // spela om server-mp3 om vi har en
  if ($audio.src) {
    try { $audio.currentTime = 0; await $audio.play(); appendStatus("Spelar (server-TTS)."); }
    catch { /* fallthrough */ }
    setBusy(false, false);
    return;
  }

  // annars browser-TTS på texten
  await speakWithBrowserTTS(story || "", getVoice(), getTempo());
  setBusy(false, false);
}

function stopAll() {
  try { speechSynthesis.cancel(); } catch {}
  try { $audio.pause(); } catch {}
  appendStatus("Stopp.");
  setBusy(false, false);
}

// ——— Browser TTS fallback ———
async function speakWithBrowserTTS(text, voiceKey, tempo) {
  return new Promise((resolve) => {
    if (typeof window.speechSynthesis === "undefined") {
      appendStatus("Webbläsaren har ingen inbyggd TTS."); return resolve();
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

    u.onend = () => { appendStatus("Klar (webbläsare)."); resolve(); };
    u.onerror = () => { appendStatus("Fel i webbläsar-röst."); resolve(); };

    try { speechSynthesis.cancel(); } catch {}
    try { speechSynthesis.speak(u); } catch { resolve(); }
  });
}

// ——— bind ———
$btnGen?.addEventListener("click", generate);
$btnPlay?.addEventListener("click", replay);
$btnStop?.addEventListener("click", stopAll);

// init
appendStatus("BN front laddad (v1.4.2).");
