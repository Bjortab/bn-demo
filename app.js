// === Same-origin API: använd relativa paths ===
const API_BASE = ""; // tomt = samma origin

// UI element
const els = {
  gateOk: document.getElementById('gateOk'),
  btnStart: document.getElementById('btnStart'),
  studio: document.getElementById('studio'),

  length: document.getElementById('length'),
  spice: document.getElementById('spice'),
  spiceLabel: document.getElementById('spiceLabel'),
  voice: document.getElementById('voice'),
  words: document.getElementById('words'),

  prompt: document.getElementById('prompt'),
  btnPreview: document.getElementById('btnPreview'),
  btnRead: document.getElementById('btnRead'),
  btnDownload: document.getElementById('btnDownload'),

  status: document.querySelector('.status') || document.getElementById('status'),
  excerpt: document.getElementById('excerpt'),
  player: document.getElementById('player'),
};

// gate
els.gateOk.addEventListener('change', () => {
  els.btnStart.disabled = !els.gateOk.checked;
});
els.btnStart.addEventListener('click', () => {
  els.studio.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// beräkning
function calcWords(mins){ return Math.round(Number(mins) * 170); }
function updateWords(){ els.words.textContent = calcWords(els.length.value); }

function describeSpice(n){
  const m = Number(n);
  switch(m){
    case 1: return 'Nivå 1 – varm, romantisk (icke-grafiskt).';
    case 2: return 'Nivå 2 – mild med varm stämning.';
    case 3: return 'Nivå 3 – tydligt sensuell, stillsam intensitet.';
    case 4: return 'Nivå 4 – explicit språk (vuxet), inga minderåriga/övergrepp.';
    case 5: return 'Nivå 5 – mest explicit (vuxet, samtycke) – kraftigt språk.';
    default: return `Nivå ${m}`;
  }
}
function setStatus(msg, type=''){
  els.status.textContent = msg;
  els.status.classList.remove('ok','warn','err');
  if(type) els.status.classList.add(type);
}

[els.length, els.spice].forEach(i => i.addEventListener('input', ()=>{
  updateWords();
  els.spiceLabel.textContent = describeSpice(els.spice.value);
}));
updateWords();
els.spiceLabel.textContent = describeSpice(els.spice.value);

// Hjälpare: fetch med timeout + JSON fel
async function api(path, payload, opts = {}){
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), opts.timeoutMs ?? 20000);

  try{
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const ct = res.headers.get('content-type') || '';
    if(!res.ok){
      let msg = `${res.status} ${res.statusText}`;
      if(ct.includes('application/json')){
        const err = await res.json().catch(()=>null);
        if(err && err.error) msg = `${msg}: ${err.error}`;
      }else{
        const t = await res.text().catch(()=> '');
        if(t) msg = `${msg}: ${t.slice(0,180)}`;
      }
      throw new Error(msg);
    }
    if(ct.includes('application/json')) return await res.json();
    return await res.arrayBuffer(); // för /api/tts (audio)
  } finally {
    clearTimeout(timeout);
  }
}

function lockUI(lock=true){
  [els.btnPreview, els.btnRead, els.btnDownload, els.length, els.spice, els.voice, els.prompt]
    .forEach(el => el.disabled = lock);
}

// Preview = bara text (ingen TTS)
els.btnPreview.addEventListener('click', async ()=>{
  const idea = (els.prompt.value || '').trim();
  if(!idea){ setStatus('Skriv en idé först.', 'warn'); return; }

  setStatus('Skapar utdrag…', 'warn');
  lockUI(true);
  try{
    const data = await api('/api/generate', {
      idea, minutes: Number(els.length.value), spice: Number(els.spice.value)
    });
    els.excerpt.textContent = data?.excerpt || '(Inget utdrag)';
    setStatus('Utdrag klart.', 'ok');
  }catch(err){
    setStatus(`Generate failed: ${err.message}`, 'err');
  }finally{
    lockUI(false);
  }
});

// Read = text + TTS
els.btnRead.addEventListener('click', async ()=>{
  const idea = (els.prompt.value || '').trim();
  if(!idea){ setStatus('Skriv en idé först.', 'warn'); return; }

  setStatus('Skapar berättelse…', 'warn');
  lockUI(true);
  els.player.pause();
  els.player.removeAttribute('src');

  try{
    // 1) text
    const story = await api('/api/generate', {
      idea, minutes: Number(els.length.value), spice: Number(els.spice.value)
    });
    els.excerpt.textContent = story?.excerpt || '(Utdrag saknas)';

    // 2) tts
    setStatus('Renderar röst… (kan ta några sekunder)', 'warn');
    const audioBuf = await api('/api/tts', { text: story.text, voice: els.voice.value }, { timeoutMs: 60000 });

    // 3) spela
    const blob = new Blob([audioBuf], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    els.player.src = url;
    await els.player.play().catch(()=>{});
    setStatus('Klar. Spelar upp.', 'ok');
  }catch(err){
    setStatus(`Generate failed: ${err.message}`, 'err');
  }finally{
    lockUI(false);
  }
});

// Ladda ner text som .txt
els.btnDownload.addEventListener('click', ()=>{
  const text = els.excerpt.textContent || '';
  if(!text){ setStatus('Inget att spara ännu.', 'warn'); return; }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'berattelse.txt';
  a.click();
});
