// app.js — Golden Copy
const $ = (q) => document.querySelector(q);

const elLevel   = $("#level");
const elLength  = $("#length");
const elVoice   = $("#voice");
const elTempo   = $("#tempo");
const elIdea    = $("#userIdea");
const btnGen    = $("#generateBtn");
const btnPlay   = $("#listenBtn");
const btnStop   = $("#stopBtn");
const outStory  = $("#story");
const outPre    = $("#output");
const audioEl   = $("#audio");
const apiOkEl   = $("#apiStatus");

const BASE = location.origin + "/api";

let lastStory = "";
let playing = false;

function setBusy(b) {
  btnGen.disabled  = b;
  btnPlay.disabled = b || !lastStory;
  btnStop.disabled = !playing;
}

function show(msg) {
  outPre.textContent = msg;
}

async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/health`);
    apiOkEl.textContent = res.ok ? "API: ok" : "API: fail";
  } catch {
    apiOkEl.textContent = "API: fail";
  }
}
checkHealth();

btnGen.addEventListener("click", async () => {
  setBusy(true);
  show("(genererar ...)");
  outStory.textContent = "";

  const level   = Number(elLevel.value || 3);
  const minutes = Number(elLength.value || 5);
  const voice   = elVoice.value || "alloy";
  const idea    = (elIdea.value || "").trim();

  try {
    const res = await fetch(`${BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, level, minutes, voice }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.ok) {
      const detail = data?.detail || "";
      show("(fel vid generering)");
      console.error("generate error:", detail || data);
      lastStory = "";
    } else {
      lastStory = data.story || "";
      outStory.textContent = lastStory;
      show(""); // rensa
      btnPlay.disabled = !lastStory;
    }
  } catch (e) {
    show("(fel vid generering)");
    console.error(e);
    lastStory = "";
  } finally {
    setBusy(false);
  }
});

btnPlay.addEventListener("click", async () => {
  if (!lastStory) return;
  setBusy(true);
  try {
    const speed = Number(elTempo.value || 1.0);
    const voice = elVoice.value || "alloy";
    const res = await fetch(`${BASE}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lastStory, voice, speed }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("TTS error", t);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    audioEl.src = url;
    await audioEl.play();
    playing = true;
    btnStop.disabled = false;
  } catch (e) {
    console.error(e);
  } finally {
    setBusy(false);
  }
});

btnStop.addEventListener("click", () => {
  try { audioEl.pause(); } catch {}
  playing = false;
  btnStop.disabled = true;
});
