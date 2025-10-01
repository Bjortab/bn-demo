// BlushNarratives — Core frontend controller (GC v1.6.2c)

// 🔧 Byt till din Worker-URL
const API_BASE = "https://bn-worker.bjorta-bb.workers.dev";

// (valfritt) auth-token om din Worker kräver det
// Sätt en gång i devtools: localStorage.setItem('BN_AUTH_TOKEN', 'Bearer superhemlig123')
const AUTH_TOKEN = localStorage.getItem("BN_AUTH_TOKEN") || "";

// Små DOM-hjälpare
const $  = (sel) => document.querySelector(sel);
const log = (m) => {
  const el = $("#log");
  const t  = new Date().toLocaleTimeString();
  el.textContent += `[${t}] ${m}\n`;
  el.scrollTop = el.scrollHeight;
};

// Status-knapp
async function statusPing() {
  log("Status…");
  try {
    const res = await fetch(`${API_BASE}/api/v1/status`, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: AUTH_TOKEN ? { "Authorization": AUTH_TOKEN } : {}
    });
    const j = await res.json();
    log(`Status: ${JSON.stringify(j)}`);
  } catch (e) {
    log(`Status-fel: ${e.message}`);
    alert("Failed to fetch. Se loggen för detaljer.");
  }
}

// Generera text + (ev.) TTS
async function generate() {
  const prompt  = $("#prompt").value.trim();
  const level   = parseInt($("#level").value, 10);
  const minutes = parseInt($("#minutes").value, 10);
  const lang    = $("#lang").value;

  if (!prompt) { alert("Skriv en prompt…"); return; }

  $("#go").disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/v1/episodes/generate`, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        ...(AUTH_TOKEN ? { "Authorization": AUTH_TOKEN } : {})
      },
      body: JSON.stringify({ prompt, lvl: level, minutes, lang })
    });

    if (!res.ok) {
      const txt = await res.text().catch(()=> "");
      throw new Error(`HTTP ${res.status} ${txt}`);
    }

    const data = await res.json();
    log(`POST /episodes/generate -> ${JSON.stringify({
      ok: data.ok,
      provider: data.provider,
      model: data.model,
      tts: data.tts?.provider
    })}`);

    // Spela upp TTS om vi fick med ljud
    if (data.audio && data.audio.format && data.audio.base64) {
      const src = `data:audio/${data.audio.format};base64,${data.audio.base64}`;
      const player = $("#player");
      player.src = src;
      player.play().catch(()=>{ /* ignore */ });
    }
  } catch (e) {
    log(`Status-fel: ${e.message}`);
    alert("Failed to fetch. Se loggen för detaljer.");
  } finally {
    $("#go").disabled = false;
  }
}

// Wire up
window.addEventListener("DOMContentLoaded", () => {
  $("#status").addEventListener("click", statusPing);
  $("#go").addEventListener("click", generate);
  // auto-status vid start är skönt:
  statusPing();
  // Exponera för snabb manuell test i konsolen
window.statusPing = statusPing;
window.generate = generate;
});
