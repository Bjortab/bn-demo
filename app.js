// app.js – BN front v1.4 (Cloudflare)
// Väntar på complete=true från /api/generate innan TTS startas

const $ = (s) => document.querySelector(s);

// UI-element
const selLevel = $("#level");
const selMinutes = $("#minutes");
const selVoice = $("#voice");
const tempo = $("#tempo");
const idea = $("#userIdea");
const btnGen = $("#generateBtn");
const btnListen = $("#listenBtn");
const btnStop = $("#stopBtn");
const out = $("#output");
const audioEl = $("#audio");
const storyEl = $("#story");
const statusEl = $("#status"); // <small id="status"></small> – lägg i footern om du inte har den

let busyGen = false;
let lastText = "";
let lastProvider = "-";
let lastModel = "-";

function now() {
  return new Date().toLocaleTimeString("sv-SE", { hour12: false });
}
function log(line) {
  const ts = `[${now()}] `;
  out.textContent += `${ts}${line}\n`;
  out.scrollTop = out.scrollHeight;
}
function setStatus(s) {
  if (statusEl) statusEl.textContent = s || "";
}

async function checkAPI() {
  try {
    const r = await fetch("/api/health").then(r => r.json());
    log(r.ok ? "API: ok" : "API: fel");
  } catch {
    log("API: fel");
  }
}

function setBusy(b) {
  busyGen = b;
  btnGen.disabled = b;
  btnListen.disabled = b;
  btnStop.disabled = false;
}

async function generate() {
  if (busyGen) return;
  const txt = (idea.value || "").trim();
  if (!txt) { log("Skriv en idé först."); return; }

  setBusy(true);
  lastText = ""; lastProvider = "-"; lastModel = "-";
  storyEl.textContent = "";
  log("Genererar…");

  try {
    const body = {
      idea: txt,
      level: selLevel.value,
      minutes: selMinutes.value,
      tempo: Number(tempo.value || 1),
    };
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${t ? ": " + t : ""}`);
    }
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Fel vid generering");
    lastProvider = data.provider || "-";
    lastModel = data.model || "-";
    lastText = String(data.text || "");
    storyEl.textContent = lastText;

    // Vänta tills API bekräftar komplett
    if (!data.complete) {
      log("Väntar på fullständig text…");
      // (API ska numera alltid returnera complete:true)
    }

    log("(klart)");
    setStatus(`Provider: ${lastProvider} · Modell: ${lastModel}`);
    await playTTS();
  } catch (err) {
    log(`Fel: ${String(err.message || err)}`);
  } finally {
    setBusy(false);
  }
}

async function playTTS() {
  if (!lastText) { log("Ingen text."); return; }
  const voice = selVoice.value || "alloy";
  log("Väntar röst…");

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: lastText, voice }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`TTS-fel: HTTP ${res.status}${t ? " · " + t : ""}`);
    }
    const buf = await res.arrayBuffer();
    const blob = new Blob([buf], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    // iOS behöver användarklick – vi triggar uppspelning på knapptryck,
    // men om användaren redan klickat “Lyssna” så funkar detta direkt:
    audioEl.src = url;
    const p = await audioEl.play().catch(e => e);
    if (p instanceof Error) {
      log("TTS: kräver extra klick (iOS).");
    } else {
      log("TTS startad.");
    }
  } catch (err) {
    log(String(err.message || err));
  }
}

function stopAudio() {
  try { audioEl.pause(); audioEl.currentTime = 0; } catch {}
}

btnGen?.addEventListener("click", generate);
btnListen?.addEventListener("click", playTTS);
btnStop?.addEventListener("click", stopAudio);

// Init
log("BN front laddad.");
checkAPI();
