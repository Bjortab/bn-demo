// BN – Frontend med synlig audio-spelare, nivåknappar, röst/hastighet och robust status

const els = {
  minutes: document.querySelector('#length'),
  spiceRadios: [...document.querySelectorAll('input[name="spice"]')],
  voice: document.querySelector('#voice'),
  rate: document.querySelector('#rate'),
  idea: document.querySelector('#idea'),
  btnPreview: document.querySelector('#btnPreview'),
  btnRead: document.querySelector('#btnRead'),
  btnDownload: document.querySelector('#btnDownload'),
  status: document.querySelector('#status'),
  excerpt: document.querySelector('#excerpt'),
  player: document.querySelector('#player'),
  spiceHint: document.querySelector('#spiceHint'),
};

function getSpiceLevel(){ const r=els.spiceRadios.find(x=>x.checked); return r ? Number(r.value) : 1; }
function uiStatus(msg,isErr=false){ if(!els.status) return; els.status.textContent=msg||""; els.status.style.color = isErr? "#ff6b6b":"#9cc67b"; }
function makeExcerpt(full,max=320){ if(!full) return ""; const s=full.trim(); if(s.length<=max) return s; const cut=s.lastIndexOf('.',max); return s.slice(0,cut>120?cut+1:max)+"…"; }

async function api(path, payload, timeoutMs=45000){
  const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(path, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload||{}),
      signal: ctrl.signal
    });
    clearTimeout(to); return res;
  }catch(e){ clearTimeout(to); throw e; }
}

function updateSpiceHint(){
  const lvl=getSpiceLevel();
  const map={
    1:"Nivå 1 – romantiskt och antydande.",
    2:"Nivå 2 – mild med varm stämning.",
    3:"Nivå 3 – tydligt sensuellt, utan råa ord.",
    4:"Nivå 4 – hett och explicit (vuxet språk).",
    5:"Nivå 5 – maximalt hett (vuxet språk, ej våld/icke-samtycke)."
  };
  if(els.spiceHint) els.spiceHint.textContent = map[lvl] || "";
}
els.spiceRadios.forEach(r=> r.addEventListener('change', updateSpiceHint));
updateSpiceHint();

async function onReadClick(){
  try{
    uiStatus("Genererar berättelse …");
    const idea = (els.idea?.value || "").trim();
    if(!idea){ uiStatus("Skriv in en idé först.", true); return; }

    const minutes = Number(els.minutes?.value || 5);
    const level   = getSpiceLevel();
    const voice   = els.voice?.value || "alloy";
    const rate    = Number(els.rate?.value || 1.25);

    // 1) Text
    const genRes = await api("/api/generate", { idea, minutes, level });
    if(!genRes.ok){ const t=await genRes.text().catch(()=> ""); uiStatus(`Textgenerering misslyckades (${genRes.status}).`, true); console.error(t); return; }
    const { text } = await genRes.json();
    if(!text || !text.trim()){ uiStatus("Textgenereringen gav tomt resultat.", true); return; }
    els.excerpt.textContent = makeExcerpt(text);

    // 2) TTS
    uiStatus("Skapar röst …");
    const ttsRes = await api("/api/tts", { text, voice });
    if(!ttsRes.ok){ const t=await ttsRes.text().catch(()=> ""); uiStatus(`TTS misslyckades (${ttsRes.status}).`, true); console.error(t); return; }
    const buf = await ttsRes.arrayBuffer();
    const blob = new Blob([buf], { type:"audio/mpeg" });
    const url  = URL.createObjectURL(blob);

    // 3) Spela – kontrollerna syns tack vare <audio controls>
    els.player.src = url;
    els.player.playbackRate = rate;         // standard 1.25× om du valde det i menyn
    await els.player.play().catch(()=>{});
    uiStatus("Klar.");
  }catch(e){
    uiStatus(e.name==="AbortError" ? "Avbrutet (timeout)." : "Fel vid uppspelning.", true);
    console.error(e);
  }
}

function onPreview(){
  // Förhandslyssna = spela nuvarande clip om finns (annars be användaren läsa upp först)
  if(!els.player?.src){ uiStatus("Ingen röst genererad ännu.", true); return; }
  els.player.playbackRate = Number(els.rate?.value || 1.25);
  els.player.play().catch(()=>{});
}

function onDownload(){
  const text = els.excerpt?.textContent?.trim();
  if(!text){ uiStatus("Ingen text att ladda ner ännu.", true); return; }
  const blob = new Blob([text], { type:"text/plain;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download="berattelse.txt";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// Event hooks
els.btnRead?.addEventListener('click', onReadClick);
els.btnPreview?.addEventListener('click', onPreview);
els.btnDownload?.addEventListener('click', onDownload);

// Säkerställ att mobilen inte submit:ar något form av misstag
document.addEventListener('submit', e => { e.preventDefault(); e.stopPropagation(); }, true);
