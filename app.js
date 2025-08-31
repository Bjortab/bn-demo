// app.js — Golden Copy v1.3.3 (Audio-safe + warnings)

const $ = (s) => document.querySelector(s);

// UI refs
const levelSel   = $("#level");
const lengthSel  = $("#length");
const voiceSel   = $("#voice");
const tempoSel   = $("#tempo");
const ideaInput  = $("#userIdea");

const generateBtn = $("#generateBtn");
const listenBtn   = $("#listenBtn");
const stopBtn     = $("#stopBtn");

const outputPre   = $("#output");
const statusBox   = $("#statusBox");
const providerEl  = $("#statusProvider");
const modelEl     = $("#statusModel");
const warningsEl  = $("#warnings");

// story buffer
window.currentStory = "";

// Audio state
let currentAudio = null;
let currentAudioUrl = null;
let isPlaying = false;
let isFetchingTTS = false;

function cleanupAudio() {
  try { if (currentAudio) { currentAudio.pause(); currentAudio.src = ""; } } catch {}
  try { if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl); } catch {}
  currentAudio = null;
  currentAudioUrl = null;
  isPlaying = false;
}
function setButtonsBusy(busy) {
  generateBtn.disabled = !!busy;
  listenBtn.disabled   = isFetchingTTS;
  stopBtn.disabled     = !isPlaying && !isFetchingTTS;
}
function setStatus(text, provider = "", model = "") {
  if (statusBox) statusBox.textContent = text || "-";
  if (providerEl) providerEl.textContent = provider || "-";
  if (modelEl) modelEl.textContent = model || "-";
}
function setWarnings(list) {
  if (!warningsEl) return;
  warningsEl.innerHTML = "";
  if (Array.isArray(list) && list.length) {
    const ul = document.createElement("ul");
    list.forEach(w => { const li = document.createElement("li"); li.textContent = w; ul.appendChild(li); });
    warningsEl.appendChild(ul);
  }
}
function appendOut(line) {
  const now = new Date();
  const hh = now.getHours().toString().padStart(2,"0");
  const mm = now.getMinutes().toString().padStart(2,"0");
  const ss = now.getSeconds().toString().padStart(2,"0");
  outputPre.textContent += `[${hh}:${mm}:${ss}] ${line}\n`;
  outputPre.scrollTop = outputPre.scrollHeight;
}
function setStory(text) {
  window.currentStory = text || "";
  outputPre.textContent = (text || "").trim() || "(tomt)";
  outputPre.scrollTop = 0;
}

// Health ping
(async () => {
  try {
    const r = await fetch("/api/health");
    const js = await r.json().catch(()=>({}));
    setStatus((js && js.ok) ? "API: ok" : "API: fel");
  } catch { setStatus("API: fel"); }
})();

// GENERATE
generateBtn.addEventListener("click", async () => {
  cleanupAudio(); setWarnings([]);
  setButtonsBusy(true);

  const idea   = (ideaInput.value || "").trim();
  const level  = Number(levelSel.value || 3);
  const minutes= Number(lengthSel.value || 5);
  const voice  = (voiceSel.value || "alloy");
  const tempo  = Number(tempoSel.value || 1.0);

  if (!idea) { setButtonsBusy(false); setStatus("Skriv in din idé först."); return; }

  setStatus("Genererar…");
  appendOut("Genererar…");

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea, level, minutes, voice, tempo })
    });
    const raw = await res.text();
    let js = {}; try { js = JSON.parse(raw); } catch { throw new Error(`Felaktigt JSON: ${raw.slice(0,160)}…`); }

    providerEl.textContent = js.provider || "-";
    modelEl.textContent    = js.model || "-";
    setWarnings(js.warnings || []);

    if (!res.ok || !js.ok) {
      setStatus("Fel vid generering");
      appendOut(`Fel: ${js.detail || js.error || `HTTP ${res.status}`}`);
      setButtonsBusy(false);
      return;
    }

    setStory(js.text || "");
    setStatus("Klart – tryck Lyssna för uppläsning.", js.provider || "", js.model || "");
    appendOut("Klart.");
  } catch (err) {
    console.error(err);
    setStatus("Fel vid generering.");
    appendOut("Fel vid generering.");
  } finally {
    isFetchingTTS = false; isPlaying = false; setButtonsBusy(false);
  }
});

// STOP
stopBtn.addEventListener("click", () => {
  if (currentAudio) currentAudio.pause();
  cleanupAudio(); setButtonsBusy(false);
  setStatus("Stoppad.");
  appendOut("Stoppad.");
});

// LYSSNA (iOS-säker)
listenBtn.addEventListener("click", async () => {
  if (!window.currentStory || !window.currentStory.trim()) {
    setStatus("Generera en berättelse först."); return;
  }
  if (isFetchingTTS || isPlaying) {
    setStatus("Vänta – uppspelning pågår…"); return;
  }

  isFetchingTTS = true; setButtonsBusy(true);
  setStatus("Hämtar röst…"); appendOut("Väntar röst…");

  try {
    const level = Number(levelSel.value || 3);
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: window.currentStory, level })
    });
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);

    cleanupAudio();
    currentAudioUrl = url;
    currentAudio = new Audio(url);
    currentAudio.preload = "auto";
    currentAudio.crossOrigin = "anonymous";

    currentAudio.addEventListener("ended", () => {
      cleanupAudio(); setButtonsBusy(false);
      setStatus("Klart."); appendOut("Klart.");
    });
    currentAudio.addEventListener("error", (e) => {
      console.warn("Audio error:", e);
      cleanupAudio(); setButtonsBusy(false);
      setStatus("Fel vid uppspelning. Tryck Lyssna igen."); appendOut("TTS-fel: uppspelning.");
    });

    try {
      await currentAudio.play();
      isPlaying = true; isFetchingTTS = false; setButtonsBusy(true);
      setStatus("Spelar upp 🎧");
    } catch (err) {
      console.warn("Auto-play block på iOS:", err);
      isFetchingTTS = false; cleanupAudio(); setButtonsBusy(false);
      setStatus("iOS block: tryck Lyssna igen för att starta."); appendOut("TTS: kräver extra klick (iOS).");
    }
  } catch (err) {
    console.error("Fel vid uppläsning:", err);
    isFetchingTTS = false; cleanupAudio(); setButtonsBusy(false);
    setStatus("Fel vid uppläsning: " + (err.message || err));
    appendOut("TTS-fel: " + (err.message || err));
  }
});

// QoL: Cmd/Ctrl/Shift+Enter för att generera
ideaInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.shiftKey)) generateBtn?.click();
});

appendOut("BN front v1.3.3 (Cloudflare)");
