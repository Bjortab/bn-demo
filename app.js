// app.js
const $ = (q) => document.querySelector(q);

// UI
const elLevel  = $("#level");
const elLen    = $("#length");
const elVoice  = $("#voice");
const elTempo  = $("#tempo");
const elIdea   = $("#idea");
const elOut    = $("#output");
const btnGen   = $("#generateBtn");
const btnPlay  = $("#listenBtn");
const btnStop  = $("#stopBtn");
const elApiOk  = $("#apiOk");

// API bas (Cloudflare Pages)
const BASE = location.origin + "/api";

async function checkHealth() {
  try {
    const res = await fetch(BASE + "/health");
    const ok  = res.ok;
    if (elApiOk) elApiOk.textContent = ok ? "ok" : "fail";
  } catch { if (elApiOk) elApiOk.textContent = "fail"; }
}
checkHealth();

function setBusy(b) {
  btnGen.disabled = b;
  btnPlay.disabled = b;
  btnStop.disabled = b;
}

async function safeJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    return { ok: false, error: "Ogiltig JSON", raw: text };
  }
}

btnGen?.addEventListener("click", async () => {
  setBusy(true);
  elOut.textContent = "(genererar …)";
  try {
    const payload = {
      level: Number(elLevel?.value || 3),
      minutes: Number(elLen?.value || 5),
      idea: (elIdea?.value || "").trim()
    };
    const res = await fetch(BASE + "/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      elOut.textContent = `Fel (generate): ${text || res.statusText}`;
      return;
    }

    const data = await safeJson(res);
    if (!data.ok) {
      elOut.textContent = `Fel (generate json): ${data.error || "okänt"}`;
      return;
    }

    elOut.textContent = data.story || "(tomt)";
  } catch (e) {
    elOut.textContent = `Undantag: ${e?.message || e}`;
  } finally {
    setBusy(false);
  }
});

let audioEl;
btnPlay?.addEventListener("click", async () => {
  const text = elOut.textContent.trim();
  if (!text) return;

  setBusy(true);
  try {
    const res = await fetch(BASE + "/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: (elVoice?.value || "alloy"),
        speed: Number(elTempo?.value || 1.0)
      })
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      alert(`TTS fel: ${t || res.statusText}`);
      return;
    }
    const blob = await res.blob();
    if (audioEl) { audioEl.pause(); audioEl = null; }
    audioEl = new Audio(URL.createObjectURL(blob));
    audioEl.play().catch(()=>{});
  } catch (e) {
    alert(`TTS undantag: ${e?.message || e}`);
  } finally {
    setBusy(false);
  }
});

btnStop?.addEventListener("click", () => {
  try { window.speechSynthesis?.cancel(); } catch {}
  try { audioEl?.pause(); } catch {}
});
