// === Frontend som matchar Cloudflare Pages Functions ===
// Endpoints: /api/generate (JSON) och /api/tts (audio/mpeg)

const API_BASE = `${location.origin}/api`;

// ---- DOM refs
const els = {
  idea: document.getElementById('idea'),
  length: document.getElementById('length'),
  levelGrp: document.getElementById('levelGrp'),
  levelHelp: document.getElementById('levelHelp'),
  voice: document.getElementById('voice'),
  speed: document.getElementById('speed'),
  btnGen: document.getElementById('generateBtn'),
  btnDl: document.getElementById('downloadTxtBtn'),
  status: document.getElementById('status'),
  story: document.getElementById('storyText'),
  player: document.getElementById('audioPlayer'),
};

// ---- state
let currentLevel = 1;
let currentText = "";

// Hjälptexter per nivå
const LEVEL_HELP = {
  1: "Nivå 1 – romantiskt och antydande.",
  2: "Nivå 2 – mild med varm stämning.",
  3: "Nivå 3 – sensuellt och tydligare beskrivningar.",
  4: "Nivå 4 – hett och direkt språk.",
  5: "Nivå 5 – mest explicit (alltid samtycke; inga minderåriga)."
};

// Markera nivåknapp + hjälpfält
function selectLevel(n){
  currentLevel = n;
  document.querySelectorAll('.lvl').forEach(b=>{
    b.classList.toggle('active', Number(b.dataset.lvl)===n);
  });
  els.levelHelp.textContent = LEVEL_HELP[n] || "";
}
els.levelGrp.addEventListener('click', (e)=>{
  const b = e.target.closest('.lvl'); if(!b) return;
  selectLevel(Number(b.dataset.lvl));
});
// startvärde
selectLevel(1);

// UI status
function setStatus(msg, type=""){
  els.status.textContent = msg || "";
  els.status.className = `status ${type}`;
}

// fetch med timeout
async function postJSON(path, body, timeoutMs=60000){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    return res;
  } finally { clearTimeout(t); }
}

// huvudflöde: skapa text + TTS
els.btnGen.addEventListener('click', async ()=>{
  const idea = (els.idea.value || "").trim();
  if(!idea){ setStatus("Skriv en idé först.", "err"); return; }

  const minutes = (els.length.value==="lång") ? 10 : (els.length.value==="medel" ? 8 : 5);
  const voice = els.voice.value;
  const speed = parseFloat(els.speed.value);

  els.btnGen.disabled = true; setStatus("Skapar text…"); els.story.textContent = "";
  els.player.src = ""; els.btnDl.disabled = true;

  // 1) Text
  let text = "";
  try{
    const res = await postJSON('/generate', { idea, level: currentLevel, minutes });
    if(!res.ok){
      const errText = await res.text();
      throw new Error(`Textgenerering misslyckades (${res.status}). ${errText}`);
    }
    const data = await res.json();
    if(!data || !data.ok || !data.text) throw new Error("Tomt svar från text-API.");
    text = data.text;
    currentText = text;
  }catch(err){
    setStatus(err.message, "err");
    els.btnGen.disabled = false;
    return;
  }

  // 2) Visa text
  els.story.textContent = currentText;
  els.btnDl.disabled = false;
  setStatus("Skapar röst…");

  // 3) TTS
  try{
    const res = await postJSON('/tts', { text: currentText, voice, speed });
    if(!res.ok){
      const errText = await res.text();
      throw new Error(`TTS misslyckades (${res.status}). ${errText}`);
    }
    const buf = await res.arrayBuffer();
    const blob = new Blob([buf], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    els.player.src = url;
    els.player.play().catch(()=>{ /* användaren kan behöva klicka play */ });
    setStatus("Klar ✓", "ok");
  }catch(err){
    setStatus(err.message, "err");
  }finally{
    els.btnGen.disabled = false;
  }
});

// Ladda ner text
els.btnDl.addEventListener('click', ()=>{
  if(!currentText) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([currentText], { type:'text/plain;charset=utf-8' }));
  a.download = 'berattelse.txt';
  a.click();
});
