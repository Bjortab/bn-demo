// app.js — GC v1.3.3 (bättre TTS-loggar + robust uppspelning)
const $ = (q) => document.querySelector(q);

const elLevel = $("#level");
const elLength = $("#length");
const elVoice = $("#voice");
const elTempo = $("#tempo");
const elIdea  = $("#userIdea");
const btnGen  = $("#generateBtn");
const btnPlay = $("#listenBtn");
const btnStop = $("#stopBtn");
const out     = $("#output");
const story   = $("#story");
const audioEl = $("#audio");

let busyGen=false, busyTts=false;

function setBusy(kind, v){ if(kind==="gen") busyGen=v; if(kind==="tts") busyTts=v;
  btnGen.disabled = busyGen||busyTts; btnPlay.disabled = busyGen||busyTts; btnStop.disabled = busyGen||busyTts; }
function setStatus(t){ out.textContent = t; }
function log(line){ out.textContent += `\n[${new Date().toLocaleTimeString()}] ${line}`; }

async function checkHealth(){
  try { const r=await fetch("/api/health"); log(r.ok?"API: ok":"API: fel"); } catch{ log("API: fel"); }
}
checkHealth();

function minutesVal(){ return Number(document.querySelector("input[name='length']:checked")?.value || "5"); }
function payload(){ return { idea: elIdea.value.trim(), level: Number(elLevel.value||"3"), minutes: minutesVal() }; }

btnGen?.addEventListener("click", async ()=>{
  setBusy("gen", true); setStatus("(genererar…)"); log("Genererar…");
  try{
    const r = await fetch("/api/generate", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(payload()) });
    if(!r.ok){ log(`Fel vid generering: HTTP ${r.status}`); setBusy("gen",false); return; }
    const data = await r.json().catch(()=> ({}));
    if(!data?.ok||!data?.story){ log("Fel vid generering: tomt svar"); setBusy("gen",false); return; }
    story.textContent = data.story;
    log(`provider: ${data.provider||"?"}, model: ${data.model||"?"}`);
    log("Hämtar röst…");

    const tts = await fetch("/api/tts", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ text: data.story, voice: elVoice.value }) });
    const ct = tts.headers.get("content-type")||"";
    if(!tts.ok || !ct.startsWith("audio/")){
      const errText = await tts.text().catch(()=> ""); log(`TTS-fel: ${tts.status} ${errText.slice(0,180)}`); setBusy("gen",false); return;
    }
    const blob = await tts.blob(); const url = URL.createObjectURL(blob);
    audioEl.src = url; try{ await audioEl.play(); }catch{}
    log("(klart)");
  }catch(e){ log(`generate error: ${e?.message||e}`); }
  finally{ setBusy("gen", false); }
});

btnPlay?.addEventListener("click", ()=>{ if(audioEl?.src) audioEl.play().catch(()=>{}); });
btnStop?.addEventListener("click", ()=>{ try{ audioEl.pause(); audioEl.currentTime=0; }catch{} });
