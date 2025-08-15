// ===== API-bas (viktigt): låt vara tom för same-origin anrop =====
const API_BASE = ''; // anropa /api/... på samma domän (bn-demo01.pages.dev)

// Element
const els = {
  length:  document.getElementById('length'),
  spice:   document.getElementById('spice'),
  voice:   document.getElementById('voice'),
  words:   document.getElementById('words'),
  idea:    document.getElementById('idea'),
  btnPreview:  document.getElementById('btnPreview'),
  btnRead:     document.getElementById('btnRead'),
  btnDownload: document.getElementById('btnDownload'),
  status:  document.getElementById('status'),
  excerpt: document.getElementById('excerpt'),
  player:  document.getElementById('player'),
};

function calcWords(mins){ return Math.max(200, Math.round(mins * 170)); }

function updateWords(){
  const mins = Number(els.length.value);
  els.words.textContent = `≈ 170 ord/min → ca ${calcWords(mins)} ord per ${mins} min.`;
}
['change', 'input'].forEach(evt => {
  els.length.addEventListener(evt, updateWords);
});
updateWords();

function setStatus(msg, kind=''){
  els.status.textContent = msg;
  els.status.classList.remove('ok','err');
  if (kind) els.status.classList.add(kind);
}

async function api(path, payload={}, asBlob=false){
  const res = await fetch(`${API_BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok){
    const txt = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${txt}`);
  }
  return asBlob ? res.blob() : res.json();
}

// håller senaste genererade texten i minnet
let lastStory = '';

async function doGenerate(){
  const minutes = Number(els.length.value);
  const spice   = Number(els.spice.value);
  const idea    = (els.idea.value || '').trim();

  if (!idea) { setStatus('Skriv en idé först.', 'err'); return null; }

  setStatus('Skapar text…');
  const data = await api('generate', { minutes, spice, idea });
  lastStory = data.text || '';
  els.excerpt.textContent = data.excerpt || (lastStory.slice(0, 400) + (lastStory.length > 400 ? '…' : ''));
  setStatus('Text klar.', 'ok');
  return lastStory;
}

async function doTTS(){
  try{
    const voice = els.voice.value;
    let text = lastStory;
    if (!text) {
      const gen = await doGenerate();
      if (!gen) return;
      text = gen;
    }
    setStatus('Genererar röst…');
    const blob = await api('tts', { text, voice }, true);
    const url = URL.createObjectURL(blob);
    els.player.src = url;
    await els.player.play().catch(()=>{ /* användaren får trycka play manuellt */ });
    setStatus('Spelare redo.', 'ok');
  }catch(err){
    console.error(err);
    setStatus(`Generate failed: ${err.message}`, 'err');
  }
}

function downloadTxt() {
  const text = lastStory || (els.idea.value || '').trim();
  if (!text){ setStatus('Inget att ladda ner ännu.', 'err'); return; }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'blush-story.txt';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  setStatus('Text nedladdad.', 'ok');
}

els.btnPreview.addEventListener('click', async () => {
  try { await doGenerate(); } catch(e){ setStatus(`Fel: ${e.message}`, 'err'); }
});
els.btnRead.addEventListener('click', doTTS);
els.btnDownload.addEventListener('click', downloadTxt);
