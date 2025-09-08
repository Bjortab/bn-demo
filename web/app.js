// web/app.js — BN Core UI (prompt -> story -> TTS)
const API_BASE = "https://bn-worker.bjorta-bb.workers.dev/api/v1"; // ändra om din workers-url skiljer

// els
const form = document.getElementById("form");
const promptEl = document.getElementById("prompt");
const levelEl = document.getElementById("level");
const wordsEl = document.getElementById("words");
const voiceEl = document.getElementById("voice");
const outText = document.getElementById("outText");
const outStatus = document.getElementById("outStatus");
const playBtn = document.getElementById("play");
const stopBtn = document.getElementById("stop");
const audioEl = document.getElementById("audio");

async function api(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${JSON.stringify(data)}`);
  return data;
}

async function ensureStatus() {
  const res = await fetch(`${API_BASE}/status`);
  const data = await res.json().catch(()=>({}));
  outStatus.textContent = `LM: ${data?.lm?.provider || "?"} / ${(data?.lm?.model)||"?"} @ temp=${data?.lm?.temperature ?? "?"}; TTS:${data?.tts?.elevenlabs ? "on" : "off"}`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  outText.value = "";
  audioEl.src = "";

  const prompt = promptEl.value.trim();
  const level = Number(levelEl.value || 2);
  const words = Number(wordsEl.value || 220);
  const voice = voiceEl.value || "female";

  if (!prompt) return alert("Skriv vad du vill höra.");

  try {
    // 1) generera text
    const gen = await api("/episodes/generate", { prompt, level, lang: "sv", words });
    outText.value = gen.text || "";

    // 2) TTS
    const ttsRes = await fetch(`${API_BASE}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: gen.text, voice }),
    });
    if (!ttsRes.ok) {
      const t = await ttsRes.text();
      throw new Error(`TTS ${ttsRes.status} ${ttsRes.statusText} :: ${t}`);
    }
    const blob = await ttsRes.blob();
    audioEl.src = URL.createObjectURL(blob);
    audioEl.play().catch(()=>{});
  } catch (err) {
    alert("Fel: " + String(err));
    console.error(err);
  }
});

playBtn.addEventListener("click", ()=>{ if (audioEl.src) audioEl.play().catch(()=>{}); });
stopBtn.addEventListener("click", ()=>{ try { audioEl.pause(); audioEl.currentTime = 0; } catch {} });

ensureStatus().catch(()=>{});
