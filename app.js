// app.js

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const providerEl = document.getElementById("provider");
const modelEl = document.getElementById("model");
const storyArt = document.getElementById("storyArt");
const audioEl = document.getElementById("audioEl");

const generateBtn = document.getElementById("generateBtn");
const listenBtn = document.getElementById("listenBtn");
const stopBtn = document.getElementById("stopBtn");

function log(msg) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

async function generateStory() {
  const prompt = document.getElementById("prompt").value.trim();
  const level = document.getElementById("level").value;
  const length = document.getElementById("length").value;
  const voice = document.getElementById("voice").value;
  const tempo = document.getElementById("tempo").value;

  if (!prompt) {
    log("Fel: Ingen prompt angiven.");
    statusEl.textContent = "Fel: skriv en idé först.";
    return;
  }

  storyArt.textContent = ""; // rensa tidigare text
  statusEl.textContent = "Genererar…";
  log("Genererar…");

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, level, length, voice, tempo })
    });

    if (!res.ok) {
      throw new Error(`Fel vid API-anrop: ${res.status}`);
    }

    const data = await res.json();

    if (!data || !data.story) {
      throw new Error("API returnerade ingen berättelse.");
    }

    // skriv ut berättelsen på sidan
    storyArt.textContent = data.story;
    statusEl.textContent = "Klart.";
    providerEl.textContent = data.provider || "-";
    modelEl.textContent = data.model || "-";

    // Ladda ljud om finns
    if (data.audioUrl) {
      audioEl.src = data.audioUrl;
      audioEl.load();
      log("Röst laddad.");
    } else {
      log("Ingen ljudfil genererad.");
    }

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Fel vid generering.";
    log(`Fel: ${err.message}`);
  }
}

function playAudio() {
  if (audioEl.src) {
    audioEl.play().catch(err => {
      log("Kunde inte spela upp ljud: " + err.message);
    });
  } else {
    log("Ingen ljudfil att spela upp.");
  }
}

function stopAudio() {
  audioEl.pause();
  audioEl.currentTime = 0;
  log("Uppspelning stoppad.");
}

// Event listeners
generateBtn.addEventListener("click", generateStory);
listenBtn.addEventListener("click", playAudio);
stopBtn.addEventListener("click", stopAudio);

log("BN front laddad.");
