// Ändra bara denna rad om din worker-URL skiljer sig:
const API_BASE = "https://bn-worker.bjorta-bb.workers.dev";

const $ = (id) => document.getElementById(id);
const log = (m) => { const t = new Date().toLocaleTimeString(); $("log").textContent += `[${t}] ${m}\n`; };

async function pingStatus() {
  try {
    const r = await fetch(`${API_BASE}/api/v1/status`);
    const j = await r.json();
    log(`Status: ${JSON.stringify(j)}`);
  } catch (e) {
    log(`Status-fel: ${e}`);
  }
}

async function generate() {
  const prompt = $("prompt").value.trim();
  const level = parseInt($("level").value, 10);
  const minutes = parseInt($("minutes").value, 10);
  const lang = $("lang").value;

  if (!prompt) { alert("Skriv en prompt."); return; }

  $("go").disabled = true; log("POST /episodes/generate …");

  try {
    const r = await fetch(`${API_BASE}/api/v1/episodes/generate`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ level, minutes, lang, prompt })
    });

    const j = await r.json();
    if (!r.ok) {
      log(`Fel ${r.status}: ${JSON.stringify(j)}`);
      alert(`Fel ${r.status}: ${j.error || "okänt fel"}`);
      return;
    }

    log(`OK (cached=${!!j.cached})`);
    if (j.text) log(`Text: ${j.text.slice(0,200)}…`);
    if (j.audio?.audio_base64) {
      const src = `data:${j.audio.mime || "audio/mpeg"};base64,${j.audio.audio_base64}`;
      $("audio").src = src;
      $("audio").play().catch(()=>{});
    }
  } catch (e) {
    log(`TypeError: ${e.message}`);
    alert("Failed to fetch. Se loggen för detaljer.");
  } finally {
    $("go").disabled = false;
  }
}

$("statusBtn").addEventListener("click", pingStatus);
$("go").addEventListener("click", generate);

// Kör en statusping vid start
pingStatus();
