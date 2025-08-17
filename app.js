// === Frontend controller (robust iOS) ===
const API = "";

const els = {
  length:  document.getElementById("length"),
  levelRadios: () => Array.from(document.querySelectorAll('input[name="level"]')),
  voice:   document.getElementById("voice"),
  speed:   document.getElementById("speed"),
  idea:    document.getElementById("idea"),
  btnGenRead: document.getElementById("btnGenRead"),
  btnTxt:  document.getElementById("btnDownload"),
  status:  document.getElementById("status"),
  story:   document.getElementById("story"),
  player:  document.getElementById("player")
};

const uiStatus = (msg, err=false) => {
  if (!els.status) return;
  els.status.textContent = msg || "";
  els.status.style.color = err ? "#ff6b6b" : "#9bd67b";
};
const getLevel = () => { const r = els.levelRadios().find(x=>x.checked); return r ? Number(r.value) : 2; };

// fetch helper: timeout + cache-bust + no-store + 1 retry
async function callApi(path, payload, timeoutMs = 60000) {
  const attempt = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), timeoutMs);
    const url = `${API}${path}${path.includes("?")?"&":"?"}v=${Date.now()}`;
    try {
      const res = await fetch(url, {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify(payload||{}),
        signal: ctrl.signal,
        cache: "no-store",
        credentials: "same-origin"
      });
      clearTimeout(t);
      if (!res.ok) {
        let detail = `${res.status}`;
        try { const j = await res.json(); detail = `${res.status} :: ${j.error||j.detail||JSON.stringify(j)}`; } catch {}
        throw new Error(detail);
      }
      return res.json();
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  };
  try {
    return await attempt();
  } catch (e1) {
    // liten paus + retry (hjälper iOS “Load failed”)
    await new Promise(r=>setTimeout(r, 500));
    return attempt();
  }
}

let busy = false;
async function onGenRead(){
  if (busy) return;
  const idea = (els.idea?.value || "").trim();
  if (!idea){ uiStatus("Skriv din idé först.", true); els.idea?.focus?.(); return; }

  busy = true; els.btnGenRead?.setAttribute("disabled","true");
  uiStatus("Skapar text …");

  els.story.textContent = "";
  els.player.removeAttribute("src"); els.player.load?.();

  const level = getLevel();
  const minutes = Number(els.length?.value || 5);

  try {
    const gen = await callApi("/api/generate", { idea, level, minutes }, 70000);
    if (!gen?.ok || !gen.text) throw new Error("tomt svar från generate");
    els.story.textContent = gen.text;

    uiStatus("Genererar röst …");
    const voice = els.voice?.value || "verse";
    const speed = Number(els.speed?.value || 1.0);
    const tts = await callApi("/api/tts", { text: gen.text, voice, speed }, 90000);
    if (!tts?.ok || !tts.audio) throw new Error(tts?.error || "tts-fel");

    const b64 = tts.audio.split(",").pop();
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) buf[i] = bin.charCodeAt(i);
    const blob = new Blob([buf], { type:"audio/mpeg" });
    const url = URL.createObjectURL(blob);

    els.player.src = url;
    try { els.player.playbackRate = speed; } catch{}
    els.player.play().catch(()=>{});
    uiStatus(tts.cached ? `Klart ✔ (cached: ${tts.cached})` : "Klart ✔");
  } catch (e){
    uiStatus(`Generate failed: ${e.message || e}`, true);
    // Bonus-hjälp för mobilen
    console?.log?.("[BN] error", e);
  } finally {
    busy = false; els.btnGenRead?.removeAttribute("disabled");
  }
}

function onDownloadTxt(){
  const txt = (els.story?.textContent || "").trim();
  if (!txt) return;
  const file = new Blob([txt], {type:"text/plain;charset=utf-8"});
  const url = URL.createObjectURL(file);
  const a = document.createElement("a"); a.href = url; a.download = "berattelse.txt";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

window.addEventListener("DOMContentLoaded", ()=>{
  els.btnGenRead?.addEventListener("click", onGenRead);
  els.btnTxt?.addEventListener("click", onDownloadTxt);
});
