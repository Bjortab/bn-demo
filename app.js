// ======== UI refs ========
const elLevel = document.getElementById("level");
const elLen1 = document.getElementById("len1");
const elLen3 = document.getElementById("len3");
const elLen5 = document.getElementById("len5");
const elTempo = document.getElementById("tempo");
const elVoice = document.getElementById("voice");
const elIdea = document.getElementById("userIdea");
const elGen = document.getElementById("generateBtn");
const elPlay = document.getElementById("listenBtn");
const elStop = document.getElementById("stopBtn");
const elOut = document.getElementById("output");
const elApiBadge = document.getElementById("apiStatus"); // valfritt

let currentAudio = null;
let lastStory = "";

// Hjälp: hämta vald längd i minuter
function getMinutes() {
  if (elLen5?.checked) return 5;
  if (elLen3?.checked) return 3;
  return 1;
}

// Skriv statusrad
function status(msg) {
  if (!elOut) return;
  const p = document.createElement("p");
  p.className = "status";
  p.textContent = msg;
  elOut.prepend(p);
}

// ======== Generate ========
elGen?.addEventListener("click", async () => {
  try {
    const minutes = getMinutes();
    const level = Number(elLevel?.value || 3);
    const idea = elIdea?.value?.trim() ?? "";

    status("Genererar text …");
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, level, minutes })
    });

    const data = await res.json().catch(() => ({}));
    if (!data?.ok) {
      status("Fel vid generering.");
      return;
    }
    lastStory = data.story || "";
    // visa text
    const pre = document.createElement("pre");
    pre.textContent = lastStory;
    elOut.innerHTML = "";
    elOut.appendChild(pre);
    status("Klar.");
  } catch (e) {
    status("Något gick fel.");
  }
});

// ======== TTS ========
elPlay?.addEventListener("click", async () => {
  try {
    const text = lastStory || (elIdea?.value?.trim() ?? "");
    if (!text) return status("Ingen text att läsa.");

    const voice = (elVoice?.value ?? "alloy");
    const speed = Number(elTempo?.value || 1);

    status("Hämtar röst …");
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, speed })
    });
    if (!res.ok) {
      status("TTS fel.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (currentAudio) { currentAudio.pause(); URL.revokeObjectURL(currentAudio.src); }
    currentAudio = new Audio(url);
    currentAudio.play().catch(() => {});
  } catch (e) {
    status("Kunde inte spela upp.");
  }
});

elStop?.addEventListener("click", () => {
  if (currentAudio) currentAudio.pause();
});
