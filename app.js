// app.js

const statusEl = document.getElementById("status");
const providerEl = document.getElementById("provider");
const modelEl = document.getElementById("model");
const storyArt = document.getElementById("storyArt");
const audioEl = document.getElementById("audioEl");

const generateBtn = document.getElementById("generateBtn");
const listenBtn = document.getElementById("listenBtn");
const stopBtn = document.getElementById("stopBtn");

let lastText = "";
let lastAudio = null;

// Hjälpfunktion för status
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
  console.log("[STATUS]", msg);
}

// Hjälpfunktion för provider-info
function setProvider(provider, model) {
  if (providerEl) providerEl.textContent = provider || "-";
  if (modelEl) modelEl.textContent = model || "-";
}

// Generera berättelse
generateBtn.addEventListener("click", async () => {
  const idea = document.getElementById("idea").value.trim();
  const level = document.getElementById("level").value;
  const minutes = document.getElementById("minutes").value;
  const voice = document.getElementById("voice").value;
  const tempo = document.getElementById("tempo").value;

  if (!idea) {
    setStatus("Ingen idé inskriven!");
    return;
  }

  setStatus("Genererar…");
  storyArt.textContent = "(genererar…)";

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, level, minutes, voice, tempo }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Fel vid generering");

    lastText = data.text || "";
    storyArt.textContent = lastText || "(tomt)";

    setProvider(data.provider, data.model);
    setStatus("Klart. Väntar röst…");

    // Kör TTS direkt efter generering
    const ttsRes = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lastText, voice }),
    });

    if (!ttsRes.ok) throw new Error("TTS-fel: " + (await ttsRes.text()));
    const ttsData = await ttsRes.json();

    if (ttsData.audio) {
      lastAudio = "data:audio/mp3;base64," + ttsData.audio;
      audioEl.src = lastAudio;
      await audioEl.play().catch(() => {
        setStatus("TTS: kräver extra klick (iOS).");
      });
    }
  } catch (err) {
    console.error(err);
    setStatus("Fel: " + err.message);
    storyArt.textContent = "(fel)";
  }
});

// Lyssna igen
listenBtn.addEventListener("click", async () => {
  if (lastAudio) {
    audioEl.src = lastAudio;
    await audioEl.play().catch(() => {
      setStatus("TTS: kräver extra klick (iOS).");
    });
  } else if (lastText) {
    setStatus("Hämtar röst…");
    const voice = document.getElementById("voice").value;
    try {
      const ttsRes = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: lastText, voice }),
      });

      if (!ttsRes.ok) throw new Error("TTS-fel: " + (await ttsRes.text()));
      const ttsData = await ttsRes.json();

      if (ttsData.audio) {
        lastAudio = "data:audio/mp3;base64," + ttsData.audio;
        audioEl.src = lastAudio;
        await audioEl.play().catch(() => {
          setStatus("TTS: kräver extra klick (iOS).");
        });
      }
    } catch (err) {
      setStatus("Fel vid uppläsning: " + err.message);
    }
  } else {
    setStatus("Ingen text att läsa upp!");
  }
});

// Stoppa uppspelning
stopBtn.addEventListener("click", () => {
  if (!audioEl.paused) {
    audioEl.pause();
    audioEl.currentTime = 0;
    setStatus("Stoppad.");
  }
});
