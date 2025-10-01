// BN – app controller (GC v1.9.1)

const API_BASE = "https://bn-worker.bjorta-bb.workers.dev"; // <-- din Worker
const AUTH_TOKEN = localStorage.getItem("BN_AUTH_TOKEN") || ""; // valfritt

// Mini helpers
const $ = (sel) => document.querySelector(sel);
const log = (m) => {
  const t = new Date().toLocaleTimeString();
  const el = $("#log");
  el.textContent += `[${t}] ${m}\n`;
  el.scrollTop = el.scrollHeight;
};

async function statusPing() {
  log("Kollar status…");
  try {
    const res = await fetch(`${API_BASE}/api/v1/status`, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: AUTH_TOKEN ? { "Authorization": AUTH_TOKEN } : {}
    });
    const j = await res.json();
    log(`STATUS: ${JSON.stringify(j)}`);
  } catch (e) {
    log(`STATUS FEL: ${e.message}`);
    console.error(e);
  }
}

async function generate() {
  const prompt  = $("#prompt")?.value?.trim() || "";
  const level   = parseInt($("#level")?.value || "3", 10);
  const minutes = parseInt($("#minutes")?.value || "5", 10);
  const lang    = $("#lang")?.value || "sv";

  if (!prompt) { alert("Skriv en prompt…"); return; }

  const btn = $("#go");
  if (btn) btn.disabled = true;

  log(`Skickar POST → /episodes/generate (lvl=${level}, min=${minutes}, lang=${lang})`);

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

    // Visa preflight/headers-problem direkt
    log(`HTTP: ${res.status} ${res.statusText}`);
    if (!res.ok) {
      const txt = await res.text().catch(()=> "");
      log(`BODY: ${txt.slice(0, 300)}`);
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    log(`RESP: ${JSON.stringify({
      ok: data.ok ?? true,
      cached: data.cached,
      via: data.via,
      r2Key: data.r2Key || data.r2_key || null
    })}`);

    // Spelare: stöd både base64 och signed URL
    const player = $("#player");
    if (!player) return;

    // 1) Debug worker (v1.6.2-debug): { url: signed }
    if (data.url) {
      player.src = data.url;
      await player.play().catch(()=>{});
      return;
    }

    // 2) Nyare worker: { audio: { audio_base64, mime } }
    if (data.audio?.audio_base64) {
      const mime = data.audio?.mime || "audio/mpeg";
      player.src = `data:${mime};base64,${data.audio.audio_base64}`;
      await player.play().catch(()=>{});
      return;
    }

    // 3) Vissa svar kan returnera { audio: { format, base64 } }
    if (data.audio?.base64) {
      const fmt = data.audio?.format || "mp3";
      player.src = `data:audio/${fmt};base64,${data.audio.base64}`;
      await player.play().catch(()=>{});
      return;
    }

    log("Ingen audio i svaret – visar bara text i loggen.");
    if (data.text) log(`TEXT: ${data.text.slice(0, 240)}…`);

  } catch (e) {
    log(`FEL: ${e.message}`);
    console.error(e);
    alert("Failed to fetch – se loggen (och Network-fliken) för detaljer.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Koppla event listeners (och ha inline onclick i HTML som fallback)
window.addEventListener("DOMContentLoaded", () => {
  $("#status")?.addEventListener("click", statusPing);
  $("#go")?.addEventListener("click", generate);
  statusPing(); // auto
});

// Exponera för inline onclick + devtools
window.statusPing = statusPing;
window.generate   = generate;
