// ====== BN frontend (robust) ======
const API_BASE = location.origin;

// Tydliga referenser (måste finnas eftersom vi styr HTML:en)
const els = {
  minutes:  document.querySelector('#length'),
  levelRadios: document.querySelectorAll('input[name="level"]'),
  voice:    document.querySelector('#voice'),
  idea:     document.querySelector('#idea'),
  btnPreview: document.querySelector('#btnPreview'),
  btnRead:    document.querySelector('#btnRead'),
  btnDownload:document.querySelector('#btnDownload'),
  status:   document.querySelector('#status'),
  excerpt:  document.querySelector('#excerpt'),
  player:   document.querySelector('#player'),
  levelHelp:document.querySelector('#levelHelp')
};

// Skydda mot ev. form-submit
document.addEventListener('submit', e => { e.preventDefault(); e.stopPropagation(); }, true);

function uiStatus(msg, isErr=false){
  if(!els.status) return;
  els.status.textContent = msg;
  els.status.style.color = isErr ? '#ef7070' : '#9c6d7b';
}

function getMinutes(){ const n = Number(els.minutes?.value || '5'); return Number.isFinite(n) && n > 0 ? n : 5; }
function getLevel(){ const c = [...els.levelRadios].find(r => r.checked); return c ? Number(c.value) : 2; }
function getVoice(){ return (els.voice?.value || 'alloy'); }
function setExcerpt(t){ if(els.excerpt) els.excerpt.textContent = t || ''; }
function setAudioBlob(blob){
  if(!els.player) return;
  const url = URL.createObjectURL(blob);
  els.player.src = url;
  els.player.load();
}

function updateLevelHelp(){
  const level = getLevel();
  const map = {
    1: 'Nivå 1 – romantiskt och antydande.',
    2: 'Nivå 2 – mild med varm stämning.',
    3: 'Nivå 3 – tydligt sensuellt språk.',
    4: 'Nivå 4 – explicit men utan grafiska kroppsvätskor.',
    5: 'Nivå 5 – rått och hett (ej våld, ej minderåriga).'
  };
  if(els.levelHelp) els.levelHelp.textContent = map[level] || '';
}
updateLevelHelp();
els.levelRadios.forEach(r => r.addEventListener('change', updateLevelHelp));

async function apiPost(path, payload, asBlob=false, signal){
  const res = await fetch(`${API_BASE}${path}`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(payload),
    signal
  });
  if(!res.ok){
    const txt = await res.text().catch(()=> '');
    throw new Error(`${res.status} :: ${txt || res.statusText}`);
  }
  return asBlob ? res.blob() : res.json();
}

async function handleGenerate(preview=false){
  try{
    const idea = (els.idea?.value || '').trim();
    if(!idea){ uiStatus('Skriv en idé först.', true); return; }

    const controller = new AbortController();
    const { signal } = controller;

    const minutes = getMinutes();
    const level   = getLevel();
    const voice   = getVoice();

    uiStatus('Genererar text …');
    const gen = await apiPost('/api/generate', { idea, minutes, level }, false, signal);
    const { text, excerpt } = gen || {};
    if(!text) throw new Error('Tomt svar från textgenerering.');
    setExcerpt(excerpt || (text.slice(0, 300) + ' …'));

    if(preview){ uiStatus('Förhandsvisning klar. Tryck “Läs upp” för ljud.'); return; }

    uiStatus('Skapar ljud …');
    const wav = await apiPost('/api/tts', { text, voice }, true, signal);
    setAudioBlob(wav);
    uiStatus('Klart!');

  }catch(err){
    console.error(err);
    uiStatus(`Generate failed: ${err.message||err}`, true);
  }
}

// Knappar
['click','pointerup','touchend'].forEach(ev=>{
  els.btnPreview?.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); handleGenerate(true); }, {passive:false});
  els.btnRead?.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); handleGenerate(false); }, {passive:false});
});

// Nedladdning av txt (samma text som i utdraget, om backend-svar sparas här kan vi byta)
els.btnDownload?.addEventListener('click', ()=>{
  const text = els.excerpt?.textContent || '';
  if(!text){ uiStatus('Ingen text att ladda ner ännu.', true); return; }
  const blob = new Blob([text], { type:'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'berattelse.txt'; a.click();
  URL.revokeObjectURL(url);
});
