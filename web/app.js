// GC v1.10 — BN Core frontend

const API_BASE = "https://bn-worker.bjorta-bb.workers.dev"; // din worker
const $ = (id) => document.getElementById(id);
const log = (m) => { const d = new Date().toLocaleTimeString(); $("log").textContent += `[${d}] ${m}\n`; };

let spinTimer = null;
function startSpinner(btn) {
  stopSpinner();
  const orig = btn.dataset.origText || btn.textContent;
  btn.dataset.origText = orig;
  let dots = 0;
  spinTimer = setInterval(() => {
    dots = (dots + 1) % 4;
    btn.textContent = orig + " " + ".".repeat(dots);
  }, 350);
}
function stopSpinner(btn = $("go")) {
  if (spinTimer) clearInterval(spinTimer);
  spinTimer = null;
  if (btn && btn.dataset.origText) btn.textContent = btn.dataset.origText;
}

async function statusPing() {
  log("Kollar status…");
  try {
    const r = await fetch(`${API_BASE}/api/v1/status`, { cache: "no-store" });
    const j = await r.json();
    log(`STATUS: ${JSON.stringify(j)}`);
  } catch (e) {
    log(`Status-fel: ${e.message}`);
  }
}

// visar texten i en <pre id="story">
function showStory(txt) {
  const pre = $("story");
  if (pre) pre.textContent = txt || "";
}

async function generate() {
  const btn = $("go");
  const prompt = $("prompt").value.trim();
  const lvl = parseInt($("level").value, 10);
  const mins = parseInt($("minutes").value, 10);
  const lang = $("lang").value;

  if (!prompt) { alert("Skriv en prompt."); return; }

  btn.disabled = true;
  startSpinner(btn);
  showStory("");
  log(`Skickar POST → /episodes/generate (lvl=${lvl}, min=${mins}, lang=${lang})`);

  try {
    const resp = await fetch(`${API_BASE}/api/v1/episodes/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, lvl, minutes: mins, lang })
    });

    log(`HTTP: ${resp.status} ${resp.statusText}`);
    if (!resp.ok) {
      const errText = await resp.text().catch(()=> "");
      throw new Error(`Serverfel ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    log(`RESP: ${JSON.stringify({ ok: data.ok, cached: data.cached, r2Key: data.r2Key || null })}`);

    // visa texten
    if (data.text) showStory(data.text);

    // spela upp TTS om vi fick med ljud
    if (data.audio && data.audio.format && data.audio.base64) {
      const src = `data:audio/${data.audio.format};base64,${data.audio.base64}`;
      const player = $("player");
      player.src = src;
      try { await player.play(); } catch { /* ignore */ }
    }
  } catch (e) {
    log(`Status-fel: ${e.message}`);
    alert("Failed to fetch. Se loggen för detaljer.");
  } finally {
    stopSpinner(btn);
    btn.disabled = false;
  }
}

// wire-up
window.addEventListener("DOMContentLoaded", () => {
  $("status").addEventListener("click", statusPing);
  $("go").addEventListener("click", generate);
  statusPing(); // initial check
});

// Exponera för konsoltest
window.statusPing = statusPing;
window.generate = generate;
