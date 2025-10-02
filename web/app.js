// GC v2.0 – frontend-kontroller
// Viktigt: ändra API_BASE till din worker-URL.
const API_BASE = "https://bn-worker.bjorta-bb.workers.dev"; // <- BYT vid behov

const $ = (id) => document.getElementById(id);
const log = (m) => {
  const t = new Date().toLocaleTimeString();
  const line = `[${t}] ${m}\n`;
  const el = $("log");
  el.textContent += line;
  el.scrollTop = el.scrollHeight;
};

// enkel rullande ... spinner
let spinTimer = null;
function startSpin() {
  stopSpin();
  const s = $("spin");
  let dots = 0;
  spinTimer = setInterval(() => {
    dots = (dots + 1) % 4;
    s.textContent = ".".repeat(dots);
  }, 300);
}
function stopSpin() {
  const s = $("spin");
  if (spinTimer) clearInterval(spinTimer);
  s.textContent = "";
}

async function statusPing() {
  try {
    log("Kollar status…");
    const r = await fetch(`${API_BASE}/api/v1/status`, { method: "GET" });
    const j = await r.json();
    log(`STATUS: ${JSON.stringify(j)}`);
  } catch (e) {
    log(`Status-fel: ${e.message || e}`);
    alert("Failed to fetch. Se loggen för detaljer.");
  }
}

async function generate() {
  const btn = $("go");
  const storyBox = $("story");
  const player = $("player");

  try {
    const prompt = $("prompt").value.trim();
    const lvl = parseInt($("level").value, 10) || 3;
    const mins = parseInt($("minutes").value, 10) || 5;
    const lang = $("lang").value || "sv";
    const variant = $("variant").checked;

    if (!prompt) {
      alert("Skriv en prompt.");
      return;
    }

    btn.disabled = true;
    $("goText").textContent = "Genererar…";
    startSpin();
    storyBox.textContent = ""; // clear text

    const body = { lvl, mins, lang, prompt };
    // “Variant” ger ett seed så samma prompt kan bli annorlunda
    if (variant) body.seed = Date.now();

    log(`POST /episodes/generate (lvl=${lvl}, min=${mins}, lang=${lang}${variant ? ", variant" : ""})`);

    const r = await fetch(`${API_BASE}/episodes/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    log(`HTTP: ${r.status} ${r.statusText}`);
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`Generate ${r.status}: ${text.slice(0, 240)}`);
    }

    const data = await r.json();
    // { ok, cached, text, audio: { format, base64 }, r2Key? }
    if (data.text) {
      storyBox.textContent = data.text;
      log(`TEXT len=${data.text.length}${data.cached ? " (cache)" : " (new)"}`);
    } else {
      log("Ingen text mottagen.");
    }

    if (data.audio && data.audio.base64 && data.audio.format) {
      const src = `data:audio/${data.audio.format};base64,${data.audio.base64}`;
      player.src = src;
      try { await player.play(); } catch { /* ignore */ }
      log(`Audio: inline base64 ${data.cached ? "(cache)" : "(new)"}`);
    } else {
      log("Inget audio mottaget.");
    }
  } catch (e) {
    log(`Fel: ${e.message || e}`);
    alert("Failed to fetch. Se loggen för detaljer.");
  } finally {
    stopSpin();
    $("goText").textContent = "Generera & lyssna";
    btn.disabled = false;
  }
}

// Wire-up
window.addEventListener("DOMContentLoaded", () => {
  $("status").addEventListener("click", statusPing);
  $("go").addEventListener("click", generate);
  // auto-status vid start
  statusPing();
  // exponera för manuella tester
  window.statusPing = statusPing;
  window.generate = generate;
});
