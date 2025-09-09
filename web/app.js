// ===== Konfig =====
const API = "https://bn-worker.bjorta-bb.workers.dev/api/v1";
const $ = (s)=>document.querySelector(s);

const statusEl=$("#status"), storyEl=$("#story"), metaEl=$("#meta"), audioEl=$("#player");
const promptEl=$("#prompt"), levelEl=$("#level"), minutesEl=$("#minutes");
const goBtn=$("#go"), stopBtn=$("#stop");
$("#apiUrl").textContent = API;

// ===== Hjälp =====
function tidy(text){
  return String(text||"").replace(/\r\n/g,"\n").split(/\n{2,}/).map(x=>x.trim()).filter(Boolean).join("\n\n");
}
function sentences(text){
  return String(text||"").replace(/\s+/g," ").split(/(?<=[.!?…])\s+(?=[^\s])/u).map(s=>s.trim()).filter(Boolean);
}

// ===== Web Speech fallback (om ingen audio från API) =====
let abortSpeak=false;
async function speakBySentenceBrowser(text){
  abortSpeak = false;
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const sents = sentences(text);
  for (const s of sents){
    if (abortSpeak) break;
    const u = new SpeechSynthesisUtterance(s);
    u.lang = "sv-SE";
    u.rate = 0.95;
    u.pitch = 1.05;
    speechSynthesis.speak(u);
    await new Promise(res=>{
      const t = setInterval(()=>{
        if (abortSpeak || !speechSynthesis.speaking){ clearInterval(t); res(); }
      }, 80);
    });
    if (!abortSpeak) await new Promise(r=>setTimeout(r,100));
  }
}

// ===== Status =====
(async()=>{
  try{
    const r = await fetch(`${API}/status`);
    const j = await r.json().catch(()=> ({}));
    if (j?.ok) statusEl.textContent = `ok • v${j.v} • ${j.provider}/${j.model} • TTS:${j.tts?.provider||'none'}`;
    else statusEl.textContent="offline";
  }catch{ statusEl.textContent="offline"; }
})();

// ===== Stop =====
stopBtn.addEventListener("click", ()=>{
  abortSpeak = true;
  try{ speechSynthesis?.cancel?.(); }catch{}
  try{ audioEl.pause(); audioEl.currentTime=0; }catch{}
});

// ===== Generate =====
goBtn.addEventListener("click", async ()=>{
  const prompt = (promptEl.value||"").trim();
  const level  = Number(levelEl.value||2);
  const minutes= Number(minutesEl.value||5);
  if (!prompt){ alert("Skriv en prompt."); return; }

  goBtn.disabled = true;
  storyEl.textContent = "Skapar berättelse…";
  metaEl.textContent = "";
  stopBtn.disabled = false;
  abortSpeak = true; speechSynthesis?.cancel?.(); audioEl.pause(); audioEl.style.display="none";

  try{
    const r = await fetch(`${API}/episodes/generate`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prompt, level, minutes, lang:"sv" })
    });
    const data = await r.json().catch(()=> ({}));
    if (!r.ok || !data?.ok) throw new Error(data?.error || `${r.status} ${r.statusText}`);

    const text = tidy(data.text);
    storyEl.textContent = text;
    metaEl.textContent  = `nivå ${data.level} • ${data.minutes} min`;

    if (data.audio && data.audio.base64) {
      const mime = data.audio.mime || "audio/mpeg";
      audioEl.src = `data:${mime};base64,${data.audio.base64}`;
      audioEl.style.display = 'block';
      try { await audioEl.play(); } catch {}
    } else {
      await speakBySentenceBrowser(text);
    }
  } catch (e) {
    storyEl.textContent = `Fel: ${e.message||e}`;
  } finally {
    goBtn.disabled = false;
  }
});
