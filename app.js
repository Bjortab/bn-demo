const generateBtn = document.getElementById("generateBtn");
const listenBtn   = document.getElementById("listenBtn");
const stopBtn     = document.getElementById("stopBtn");

const ideaInput   = document.getElementById("idea");
const levelSel    = document.getElementById("level");
const minutesSel  = document.getElementById("minutes");
const storyOutput = document.getElementById("storyOutput");

const statusMsg      = document.getElementById("statusMsg");
const statusProvider = document.getElementById("statusProvider");
const statusModel    = document.getElementById("statusModel");

let currentStory = "";
let currentAudio = null;

function setStatus(message, provider = "-", model = "-") {
  statusMsg.textContent = message;
  if (provider !== null) statusProvider.textContent = provider ?? "-";
  if (model !== null)    statusModel.textContent    = model ?? "-";
}

generateBtn.addEventListener("click", async () => {
  const idea    = (ideaInput.value || "").trim();
  const level   = Number(levelSel.value);
  const minutes = Number(minutesSel.value);

  if (!idea) {
    ideaInput.focus();
    return setStatus("Skriv en idé först ✍️", "-", "-");
  }

  storyOutput.value = "";
  setStatus("Genererar…", "-", "-");

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, level, minutes })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.detail || data.error || `HTTP ${res.status}`);
    }

    currentStory = data.text || "";
    storyOutput.value = currentStory;
    setStatus("Generering klar ✅", data.provider || "-", data.model || "-");
  } catch (err) {
    console.error("Fel vid generering:", err);
    setStatus("Fel: " + (err.message || err), "-", "-");
  }
});

listenBtn.addEventListener("click", async () => {
  if (!currentStory) {
    return setStatus("Generera en berättelse först.", statusProvider.textContent, statusModel.textContent);
  }
  setStatus("Hämtar röst…", statusProvider.textContent, statusModel.textContent);

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: currentStory, level: Number(levelSel.value) })
    });

    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);

    if (currentAudio) currentAudio.pause();
    currentAudio = new Audio(url);
    await currentAudio.play();

    setStatus("Spelar upp 🎧", statusProvider.textContent, statusModel.textContent);
  } catch (err) {
    console.error("Fel vid uppläsning:", err);
    setStatus("Fel vid uppläsning: " + (err.message || err), statusProvider.textContent, statusModel.textContent);
  }
});

stopBtn.addEventListener("click", () => {
  if (currentAudio) {
    try { currentAudio.pause(); currentAudio.currentTime = 0; } catch {}
  }
  setStatus("Stoppad", statusProvider.textContent, statusModel.textContent);
});
