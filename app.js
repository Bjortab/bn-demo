/*  BN front – app.js  (Golden Copy – Stabil)
    - Robust "Generera" som alltid skickar
    - Statuspanel med Provider/Modell
    - TTS utan rekursiva/eviga loopar (iOS-säkert)
    - Försiktig felhantering + tydliga loggar i UI
*/

/* ===== Element ===== */
const $ = (sel) => document.querySelector(sel);

// UI
const selLevel   = $("#level");
const selLength  = $("#length");
const selVoice   = $("#voice");
const rangeTempo = $("#tempo");
const txtIdea    = $("#userIdea");

const btnGen  = $("#generateBtn");
const btnPlay = $("#listenBtn");
const btnStop = $("#stopBtn");

const preOut   = $("#output");   // <pre id="output">
const storyArt = $("#story");    // <article id="story">
const audioEl  = $("#audio");    // <audio id="audio">

// Statusfält (visas högst upp)
const statusEl   = $("#status");     // <span id="status"> i din statusrad
const providerEl = $("#provider");   // <span id="provider">
const modelEl    = $("#model");      // <span id="model">

/* ===== AppState ===== */
let busyGen   = false;
let busyTTS   = false;
let lastText  = "";      // Senast genererad berättelse (för TTS)
let currentURL = null;   // ObjectURL för TTS (revokas)

/* ===== Utils ===== */
function nowTime() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour12: false });
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
  appendStatus(msg);
}

function appendStatus(msg) {
  if (!preOut) return;
  const line = msg ? `[${nowTime()}] ${msg}` : "";
  preOut.textContent = preOut.textContent
    ? preOut.textContent + "\n" + line
    : line;
}

function setProviderModel(provider = "", model = "") {
  if (providerEl) providerEl.textContent = provider || "-";
  if (modelEl) modelEl.textContent = model || "-";
}

function setBusy(on) {
  busyGen = on;
  btnGen.disabled  = on;
  btnPlay.disabled = on || !lastText;
  btnStop.disabled = false;
}

/* Säkert sätt att rendera berättelsen (utan att anta att #story finns) */
function showStory(text) {
  lastText = text || "";
  if (storyArt) {
    storyArt.textContent = lastText;
  }
}

/* Nollställ ljud-spelare utan loopar */
function resetAudio() {
  try {
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute("src");
      audioEl.currentTime = 0;
    }
    if (currentURL) {
      URL.revokeObjectURL(currentURL);
      currentURL = null;
    }
  } catch (_) {}
}

/* Fetch med timeout (ms) */
async function fetchWithTimeout(url, opts = {}, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(to);
  }
}

/* ===== Backend-kopplingar ===== */

/* Hälsokoll vid start (valfri, men trevlig) */
async function checkHealth() {
  try {
    const r = await fetch("/api/health");
    const js = await r.json().catch(() => ({}));
    if (js && js.ok) {
      appendStatus("API: ok");
    } else {
      appendStatus("API: fel?");
    }
  } catch (e) {
    appendStatus("API: fel vid health");
  }
}

/* Generera berättelse */
async function doGenerate() {
  if (busyGen) return; // undvik dubbelklick
  const idea = (txtIdea?.value || "").trim();
  if (!idea) {
    setStatus("Skriv en idé först.");
    return;
  }

  // UI reset
  setBusy(true);
  resetAudio();
  setProviderModel("", "");
  showStory("");
  appendStatus(""); // radbryt
  appendStatus("Genererar…");

  const payload = {
    idea,
    level: Number(selLevel?.value || 3),
    minutes: Number(selLength?.value || 5),
    tempo: Number(rangeTempo?.value || 1.0)
  };

  try {
    const res = await fetchWithTimeout("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }, 120000); // 120s tidsgräns

    // Hantera icke-OK
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      setStatus(`Fel vid generering: HTTP ${res.status}`);
      appendStatus(raw || "(ingen feltext)");
      setBusy(false);
      return;
    }

    // Försök tolka som JSON, fallback till text
    let data;
    let textOut = "";
    try {
      data = await res.json();
      textOut = data?.text || data?.story || "";
    } catch {
      textOut = await res.text();
    }

    if (!textOut) {
      setStatus("Kunde inte generera – tomt svar.");
      setBusy(false);
      return;
    }

    // Sätt provider/modell om tillgängligt
    setProviderModel(data?.provider || "", data?.model || "");

    // Rendera berättelsen
    showStory(textOut);

    // Gör TTS direkt för bekvämlighet (utan loopar)
    appendStatus("Väntar röst…");
    await doTTS(textOut, selVoice?.value || "alloy");

    setStatus("Klart.");
  } catch (err) {
    const msg = (err && err.name === "AbortError")
      ? "Timeout."
      : (err?.message || "Fel vid generering.");
    setStatus(`Fel: ${msg}`);
  } finally {
    setBusy(false);
  }
}

/* TTS-förfrågan och enkel uppspelning */
async function doTTS(text, voice) {
  if (!audioEl) {
    appendStatus("TTS: ingen <audio> i DOM.");
    return;
  }

  busyTTS = true;
  try {
    const res = await fetchWithTimeout("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, voice })
    }, 90000);

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      appendStatus(`TTS-fel: HTTP ${res.status}`);
      if (raw) appendStatus(raw);
      return;
    }

    const blob = await res.blob();
    resetAudio(); // revoke ev. gammal
    currentURL = URL.createObjectURL(blob);
    audioEl.src = currentURL;

    // iOS kräver användargest – prova auto, annars be om klick
    try {
      await audioEl.play();
    } catch (e) {
      appendStatus("TTS: kräver extra klick (iOS).");
    }
  } catch (err) {
    const msg = (err && err.name === "AbortError")
      ? "timeout"
      : (err?.message || "okänd");
    appendStatus(`TTS-fel: ${msg}`);
  } finally {
    busyTTS = false;
  }
}

/* ===== Eventbindningar ===== */
btnGen?.addEventListener("click", (e) => {
  e.preventDefault();
  doGenerate();
});

btnPlay?.addEventListener("click", async (e) => {
  e.preventDefault();
  // Om vi redan har ett ljud – spela (eller skapa från text om saknas)
  try {
    if (!audioEl?.src) {
      if (!lastText) {
        setStatus("Inget att läsa upp ännu.");
        return;
      }
      appendStatus("Väntar röst…");
      await doTTS(lastText, selVoice?.value || "alloy");
    } else {
      await audioEl.play().catch(() => {
        appendStatus("TTS: tryck Lyssna igen (autoplay).");
      });
    }
  } catch (_) {}
});

btnStop?.addEventListener("click", (e) => {
  e.preventDefault();
  try { audioEl?.pause(); } catch (_) {}
});

/* Rensa story/ljud när man ändrar nivå/längd om man vill */
selLevel?.addEventListener("change", () => {
  // håll texten kvar, men nollställ röstkällan
  resetAudio();
});
selVoice?.addEventListener("change", () => resetAudio());

/* ===== Init ===== */
setProviderModel("-", "-");
setStatus("BN front laddad.");
checkHealth();
