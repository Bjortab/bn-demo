// app.js — Golden Copy v1.3.1 (CF Pages, robust JSON-guard)

const $ = (q) => document.querySelector(q);

// UI refs
const selLevel  = $("#level");
const selLength = $("#length");
const selVoice  = $("#voice");
const rngTempo  = $("#tempo");
const txtIdea   = $("#userIdea");
const out       = $("#output");
const btnGen    = $("#generateBtn");
const btnPlay   = $("#listenBtn");
const btnStop   = $("#stopBtn");
const audioEl   = $("#audio");

const BASE = `${location.origin}/api`;

let busyGen = false;
let busyTts = false;

function setStatus(t){ out.textContent = t; }
function appendStatus(t){
  const now = new Date().toLocaleTimeString();
  out.textContent += `\n[${now}] ${t}`;
}
function setBusy(gen=false){
  busyGen = !!gen;
  btnGen.disabled  = busyGen;
  btnPlay.disabled = busyGen || busyTts;
  btnStop.disabled = false;
}
function setAudioBusy(tts=false){
  busyTts = !!tts;
  btnPlay.disabled = busyGen || busyTts;
  btnStop.disabled = !busyTts && !busyGen;
}

async function checkHealth(){
  try{
    const r = await fetch(`${BASE}/health`);
    const js = await r.json().catch(()=>({}));
    appendStatus(js?.ok ? "API: ok" : "API: fel");
  }catch{ appendStatus("API: fel (health)"); }
}
checkHealth();

function minutesFromUI(){
  const val = Number(selLength?.value || 5);
  return Math.max(1, Math.min(30, val || 5));
}

async function generate(){
  if (busyGen) return;
  const idea = (txtIdea?.value || "").trim();
  const level = Number(selLevel?.value || 3);
  const minutes = minutesFromUI();
  if (!idea){ setStatus("(ange en idé)"); return; }

  setBusy(true);
  let dots=0;
  const spin = setInterval(()=>{ dots=(dots+1)%4; setStatus(`Genererar${".".repeat(dots)}`); },600);

  try{
    const res = await fetch(`${BASE}/generate`,{
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ idea, level, minutes })
    });

    const ct = res.headers.get("content-type")||"";
    const raw = await res.text();

    if (!ct.includes("application/json")) {
      console.error("[BN] generate RAW (non-JSON):", raw.slice(0,500));
      throw new Error(`HTTP ${res.status} (non-JSON)`);
    }

    let data={};
    try{ data = JSON.parse(raw); }catch(e){
      console.error("[BN] JSON parse fail, raw:", raw.slice(0,500)); 
      throw new Error("JSON-parse-fel");
    }

    if (!res.ok || !data.ok){
      throw new Error(data?.error ? `Fel: ${data.error}` : `Fel: HTTP ${res.status}`);
    }

    const story = data.text || "";
    if (!story) throw new Error("Tomt svar");
    out.textContent = story;

  }catch(err){
    setStatus("(fel vid generering)");
    appendStatus(String(err.message||err));
    console.error("generate error:", err);
  }finally{
    clearInterval(spin);
    setBusy(false);
  }
}

async function ttsPlay(){
  if (busyTts) return;
  const text = (out.textContent||"").trim();
  if (!text){ setStatus("(ingen text att läsa)"); return; }
  setAudioBusy(true); appendStatus("Hämtar röst …");

  const voice = selVoice?.value || "alloy";
  const rate  = Number(rngTempo?.value || 1.0);

  try{
    const res = await fetch(`${BASE}/tts`,{
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ text, voice, rate })
    });

    if (!res.ok){
      const raw = await res.text().catch(()=> "");
      console.error("[BN] TTS RAW:", raw.slice(0,500));
      throw new Error(`TTS ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    audioEl.src = url;
    await audioEl.play().catch(()=>{});
    audioEl.onended = ()=>{ setAudioBusy(false); URL.revokeObjectURL(url); appendStatus("Uppläsning klar."); };

  }catch(e){
    setAudioBusy(false);
    appendStatus("TTS fel.");
    console.error("tts error:", e);
  }
}

function ttsStop(){
  try{ audioEl.pause(); audioEl.currentTime=0; }catch{}
  setAudioBusy(false);
  appendStatus("Stopp.");
}

btnGen?.addEventListener("click", generate);
btnPlay?.addEventListener("click", ttsPlay);
btnStop?.addEventListener("click", ttsStop);

appendStatus("BN front v1.3.1 (Cloudflare)");
