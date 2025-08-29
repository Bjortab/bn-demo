// app.js — GC v1.3.2 (Cloudflare)  — uppdaterad för provider-loggar + bättre fel
const $ = (q) => document.querySelector(q);

// UI
const elLevel   = $("#level");
const elLength  = $("#length");
const elVoice   = $("#voice");
const elTempo   = $("#tempo");
const elIdea    = $("#userIdea");
const btnGen    = $("#generateBtn");
const btnPlay   = $("#listenBtn");
const btnStop   = $("#stopBtn");
const out       = $("#output");
const storyBox  = $("#story");
const audioEl   = $("#audio");

let busyGen = false;
let busyTts = false;

function setBusy(kind, v) {
  if (kind === "gen") busyGen = v;
  if (kind === "tts") busyTts = v;
  btnGen.disabled  = busyGen || busyTts;
  btnPlay.disabled = busyGen || busyTts;
  btnStop.disabled = busyGen || busyTts;
}

function setStatus(text) {
  out.textContent = text;
}
function appendStatus(line) {
  const now = new Date().toLocaleTimeString();
  out.textContent += `\n[${now}] ${line}`;
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const ok = res.ok;
    appendStatus(ok ? "API: ok" : "API: fel");
  } catch {
    appendStatus("API: fel");
  }
}
checkHealth();

// helpers
function minutesVal() {
  const sel = elLength.querySelector("input[name='length']:checked");
  const v = Number(sel?.value || "5");
  return v;
}

function buildPayload() {
  return {
    idea: elIdea.value.trim(),
    level: Number(elLevel.value || "3"),
    minutes: minutesVal()
  };
}

async function doGenerate() {
  setBusy("gen", true);
  setStatus("(genererar…)");

  try {
    const payload = buildPayload();
    appendStatus("Genererar…");

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text().catch(()=> "");
      appendStatus(`Fel vid generering: HTTP ${res.status}`);
      setBusy("gen", false);
      return;
    }

    const data = await res.json().catch(()=> ({}));
    if (!data?.ok || !data?.story) {
      appendStatus("Fel vid generering: tomt svar");
      setBusy("gen", false);
      return;
    }

    // visa story + provider-info
    storyBox.textContent = data.story;
    appendStatus(`provider: ${data.provider || "?"}, model: ${data.model || "?"}`);
    appendStatus("Väntar röst…");

    // trigga TTS
    const tts = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: data.story, voice: elVoice.value })
    });

    if (!tts.ok) {
      const errText = await tts.text().catch(()=> "");
      appendStatus(`TTS-fel: HTTP ${tts.status} ${errText}`);
      setBusy("gen", false);
      return;
    }

    const blob = await tts.blob();
    const url = URL.createObjectURL(blob);
    audioEl.src = url;
    audioEl.play().catch(()=>{});
    appendStatus("(klart)");
  } catch (err) {
    appendStatus(`generate error: ${err?.message || err}`);
  } finally {
    setBusy("gen", false);
  }
}

function stopAudio() {
  try { audioEl.pause(); audioEl.currentTime = 0; } catch {}
}

btnGen?.addEventListener("click", doGenerate);
btnPlay?.addEventListener("click", () => {
  if (audioEl?.src) audioEl.play().catch(()=>{});
});
btnStop?.addEventListener("click", stopAudio);
