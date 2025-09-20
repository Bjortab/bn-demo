// Frontend controller — GC v1.4.0

const API_BASE = "https://bn-custom-server.onrender.com";  // Ändra om din worker har annan URL

const $ = (id) => document.getElementById(id);
const log = (m) => { const d = new Date().toLocaleTimeString(); $("log").textContent += `[${d}] ${m}\n`; };

async function statusPing() {
  try {
    const r = await fetch(`${API_BASE}/api/v1/status`);
    const j = await r.json();
    log(`Status: ${JSON.stringify(j)}`);
  } catch (e) {
    log(`Status FEL: ${e}`);
  }
}

async function generate() {
  const prompt = $("prompt").value.trim();
  const level = parseInt($("level").value,10);
  const minutes = parseInt($("minutes").value,10);
  const lang = $("lang").value;

  if (!prompt) { alert("Skriv en prompt."); return; }

  $("go").disabled = true;
  $("busy").innerHTML = `<span class="spinner"></span> genererar...`;
  $("player").src = ""; $("player").load();

  try {
    log(`POST /episodes/generate (lvl ${level}, ${minutes} min, ${lang})`);
    const r = await fetch(`${API_BASE}/api/v1/episodes/generate`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ prompt, level, minutes, lang })
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`HTTP ${r.status} ${txt}`);
    }
    const j = await r.json();

    // visa text
    const header = (lang === "sv") ? `(sv) nivå ${level}` : `(en) level ${level}`;
    $("prompt").value = `${header}\n\n${j.text}`;

    if (j.audio) {
      // gör knappen grön när ljudet är klart
      $("go").classList.add("btn-green");
      $("go").textContent = "Spela upp";
      const b64 = j.audio;
      $("player").src = `data:audio/mp3;base64,${b64}`;
      $("player").load();
    } else {
      $("go").classList.remove("btn-green");
      $("go").textContent = "Generera & lyssna";
      log(`Ingen audio (tts_failed=${j.tts_failed ? "true" : "false"})`);
    }
  } catch (e) {
    log(`FEL: ${e.message}`);
    alert("Failed to fetch. Se loggen för detaljer.");
  } finally {
    $("go").disabled = false;
    $("busy").textContent = "";
  }
}

$("go").addEventListener("click", generate);
$("stop").addEventListener("click", () => { const p = $("player"); p.pause(); p.currentTime = 0; });
statusPing();
