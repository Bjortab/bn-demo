// === Konfig ===
const API = "https://bn-worker.bjorta-bb.workers.dev/api/v1";
const TEMPERATURE = 0.8;
const $ = (sel)=>document.querySelector(sel);

// === DOM ===
const statusEl=$("#status"), promptEl=$("#prompt"), levelEl=$("#level"), minutesEl=$("#minutes");
const voiceSel=$("#voice"), goBtn=$("#go"), stopBtn=$("#stop"), storyEl=$("#story"), metaEl=$("#meta");
const audioEl=$("#player"); $("#apiUrl").textContent = API;

// === Röster ===
let voices=[];
function loadVoices(){
  voices = speechSynthesis.getVoices();
  voiceSel.innerHTML="";
  const sv = voices.filter(v => (v.lang||"").toLowerCase().startsWith("sv"));
  const list = sv.length ? sv : voices;
  list.forEach(v=>{
    const opt=document.createElement("option");
    opt.value=v.name; opt.textContent=`${v.name} (${v.lang})`;
    voiceSel.appendChild(opt);
  });
}
if ("speechSynthesis" in window){ speechSynthesis.onvoiceschanged=loadVoices; loadVoices(); }

// === Hjälp ===
function minutesToWords(min){ return Math.max(120, Math.round(min * 160)); }
function tidyParagraphs(text){
  return String(text||"")
    .replace(/\r\n/g,"\n")
    .split(/\n{2,}/).map(p=>p.trim()).filter(Boolean)
    .join("\n\n");
}
function sentences(text){
  return String(text||"")
    .replace(/\s+/g," ")
    .split(/(?<=[.!?…])\s+(?=[^\s])/u)
    .map(s=>s.trim()).filter(Boolean);
}

// Läs mening-för-mening (bättre pauser än ett stort block)
let abortSpeak=false;
async function speakBySentence(text){
  abortSpeak=false;
  if (!("speechSynthesis" in window)) return;

  const sents = sentences(text);
  speechSynthesis.cancel();

  const pick = speechSynthesis.getVoices().find(v=>v.name===voiceSel.value);
  for (const s of sents){
    if (abortSpeak) break;
    const u = new SpeechSynthesisUtterance(s);
    if (pick) u.voice = pick;
    u.lang = pick?.lang || "sv-SE";
    u.rate = 0.95; u.pitch = /female|anna|helena|astrid/i.test(pick?.name||"") ? 1.05 : 1.0;
    speechSynthesis.speak(u);

    // vänta tills meningen lästs (poll enklast cross-browser)
    await new Promise(res=>{
      const chk = setInterval(()=>{
        if (abortSpeak || !speechSynthesis.speaking) { clearInterval(chk); res(); }
      }, 80);
    });

    // liten paus mellan meningar
    if (!abortSpeak) await new Promise(r=>setTimeout(r, 90));
  }
}

stopBtn.addEventListener("click", ()=>{
  abortSpeak=true;
  try{ speechSynthesis.cancel(); }catch{}
  try{ audioEl.pause(); audioEl.currentTime=0; }catch{}
});

// === Init status ===
(async ()=>{
  try{
    const r = await fetch(`${API}/status`); const j = await r.json().catch(()=> ({}));
    statusEl.textContent = j?.ok ? `ok • v${j.v} • ${j.provider}/${j.model}` : "offline";
  }catch{ statusEl.textContent="offline"; }
})();

// === Generera ===
goBtn.addEventListener("click", async ()=>{
  const prompt = (promptEl.value||"").trim();
  const level  = Number(levelEl.value||2);
  const minutes= Number(minutesEl.value||5);
  if (!prompt){ alert("Skriv en prompt."); return; }

  goBtn.disabled=true; stopBtn.disabled=false; storyEl.textContent="Skapar berättelse…"; metaEl.textContent="";
  abortSpeak=true; speechSynthesis.cancel(); audioEl.pause(); audioEl.removeAttribute("src"); audioEl.style.display="none";

  try{
    const res = await fetch(`${API}/episodes/generate`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ prompt, minutes, level, lang:"sv", temperature:TEMPERATURE })
    });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);

    const text = tidyParagraphs(data.text);
    storyEl.textContent = text;
    metaEl.textContent  = `≈ ${data.words} ord • ${data.minutes} min • nivå ${data.level}`;

    // Läs upp mening-för-mening
    await speakBySentence(text);

    // (Om backend i framtiden ger audio_url → spela den)
    if (data.audio_url) {
      speechSynthesis.cancel();
      audioEl.src = data.audio_url; audioEl.style.display="block"; await audioEl.play().catch(()=>{});
    }

  }catch(e){
    storyEl.textContent = `Fel: ${e.message||e}`;
  }finally{
    goBtn.disabled=false;
  }
});
