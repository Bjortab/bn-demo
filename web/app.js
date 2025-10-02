// Frontend controller (GC v2.0)
const API_BASE = "https://bn-worker.bjorta-bb.workers.dev"; // ändra vid behov

const $ = sel => document.querySelector(sel);
const log = (m) => { const t=new Date().toLocaleTimeString(); const el=$("#log"); el.textContent += `[${t}] ${m}\n`; el.scrollTop = el.scrollHeight; };

let spinTimer = null;
function spinner(on) {
  const s = $("#spinner"), d = $("#dots");
  if (!s) return;
  if (on) {
    s.style.display = "inline-block";
    let n = 0;
    spinTimer = setInterval(()=>{ n=(n+1)%4; d.textContent = ".".repeat(n); }, 300);
  } else {
    if (spinTimer) clearInterval(spinTimer);
    s.style.display = "none";
    $("#dots").textContent = ".";
  }
}

async function statusPing() {
  log("Status…");
  try {
    const r = await fetch(`${API_BASE}/api/v1/status`, { method:"GET" });
    const j = await r.json();
    log(`STATUS: ${JSON.stringify(j)}`);
  } catch (e) {
    log(`STATUS FEL: ${e.message}`);
  }
}

async function generate() {
  const prompt  = $("#prompt").value.trim();
  const level   = parseInt($("#level").value, 10);
  const minutes = parseInt($("#minutes").value, 10);
  const lang    = $("#lang").value;

  if (!prompt) { alert("Skriv en prompt…"); return; }

  $("#go").disabled = true; spinner(true);
  $("#text").textContent = "";
  const player = $("#player"); player.src = ""; player.pause();

  try {
    log(`POST /episodes/generate lvl=${level} min=${minutes} lang=${lang}`);
    const r = await fetch(`${API_BASE}/api/v1/episodes/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, lvl: level, minutes, lang })
    });

    log(`HTTP: ${r.status} ${r.statusText}`);
    if (!r.ok) {
      const t = await r.text().catch(()=> "");
      log(`BODY: ${t.slice(0, 300)}`);
      throw new Error(`HTTP ${r.status}`);
    }

    // JSON-svar
    const data = await r.json();
    if (data.text) {
      $("#text").textContent = data.text;
      log(`TEXT len=${data.text.length}${data.cached ? " (cache)" : ""}`);
    }

    // Audio – stöder vårt svar: { audio:{ mime, base64 } } eller signed R2 senare
    if (data.audio?.base64) {
      const src = `data:${data.audio.mime || "audio/mpeg"};base64,${data.audio.base64}`;
      player.src = src;
      await player.play().catch(()=>{});
      log(`Audio: inline base64 (${data.cached ? "cache" : "new"})`);
    } else if (data.url) {
      player.src = data.url;
      await player.play().catch(()=>{});
      log("Audio: signed URL");
    } else if (data.r2Key) {
      // proxy via worker (om du vill undvika signed URLs)
      const resp = await fetch(`${API_BASE}/api/v1/fetch_r2?key=${encodeURIComponent(data.r2Key)}`);
      if (resp.ok) {
        const blob = await resp.blob();
        player.src = URL.createObjectURL(blob);
        await player.play().catch(()=>{});
        log("Audio: proxied from R2");
      } else {
        log(`R2 proxy miss: ${resp.status}`);
      }
    } else {
      log("Ingen audio i svaret – bara text visad.");
    }

  } catch (e) {
    log(`FEL: ${e.message}`);
    alert("Failed to fetch – se loggen.");
  } finally {
    spinner(false);
    $("#go").disabled = false;
  }
}

// Wire up
window.addEventListener("DOMContentLoaded", () => {
  $("#status").addEventListener("click", statusPing);
  $("#go").addEventListener("click", generate);
  statusPing();
});
