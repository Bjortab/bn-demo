const generateBtn = document.getElementById("generateBtn");
const listenBtn = document.getElementById("listenBtn");
const storyOutput = document.getElementById("storyOutput");

const statusMsg = document.getElementById("statusMsg");
const statusProvider = document.getElementById("statusProvider");
const statusModel = document.getElementById("statusModel");

let currentStory = "";
let currentAudio = null;

function setStatus(message, provider = "-", model = "-") {
  statusMsg.textContent = message;
  statusProvider.textContent = provider;
  statusModel.textContent = model;
}

generateBtn.addEventListener("click", async () => {
  const level = document.getElementById("level").value;
  const length = document.getElementById("length").value;

  storyOutput.value = "";
  setStatus("Genererar...", "-", "-");

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, length })
    });

    if (!res.ok) throw new Error("Fel vid API-anrop");

    const data = await res.json();

    if (data.story) {
      currentStory = data.story;
      storyOutput.value = data.story;
      setStatus("Generering klar", data.provider || "-", data.model || "-");
    } else {
      setStatus("Ingen berättelse genererad", data.provider || "-", data.model || "-");
    }
  } catch (err) {
    console.error("Fel vid generering:", err);
    setStatus("Fel: " + err.message);
  }
});

listenBtn.addEventListener("click", async () => {
  if (!currentStory) {
    alert("Generera en berättelse först!");
    return;
  }

  setStatus("Hämtar röst...", statusProvider.textContent, statusModel.textContent);

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: currentStory })
    });

    if (!res.ok) throw new Error("Fel vid TTS-anrop");

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    if (currentAudio) currentAudio.pause();

    currentAudio = new Audio(url);
    currentAudio.play();

    setStatus("Spelar upp...", statusProvider.textContent, statusModel.textContent);
  } catch (err) {
    console.error("Fel vid uppläsning:", err);
    setStatus("Fel vid uppläsning");
  }
});
