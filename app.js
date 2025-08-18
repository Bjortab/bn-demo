// Frontend: en knapp -> generera text -> TTS -> spela upp
const els = {
  words: document.getElementById('words'),
  length: document.getElementById('length'),
  levelHint: document.getElementById('levelHint'),
  idea: document.getElementById('idea'),
  voice: document.getElementById('voice'),
  rate: document.getElementById('rate'),
  btnMake: document.getElementById('btnMake'),
  btnDownload: document.getElementById('btnDownload'),
  status: document.getElementById('status'),
  player: document.getElementById('player'),
  story: document.getElementById('story'),
  nav: document.querySelectorAll('nav a'),
  views: document.querySelectorAll('main.view'),
  health: document.getElementById('health')
};

const API_BASE = ''; // samma origin
const TIMEOUT_MS = 90000;

function updateWords() {
  const mins = Number(els.length.value || 5);
  els.words.textContent = String(Math.min(170*mins, 1000));
}
updateWords();
els.length.addEventListener('change', updateWords);

function setLevelHint() {
  const v = Number(document.querySelector('input[name="level"]:checked').value);
  const map = {
    1: 'Nivå 1 – romantiskt/antydande.',
    2: 'Nivå 2 – mild med varm stämning.',
    3: 'Nivå 3 – tydligt sensuellt (icke-grafiskt).',
    4: 'Nivå 4 – hett språk, vuxna teman (ej grafiskt).',
    5: 'Nivå 5 – mest hett och direkt (din ordlista styr).'
  };
  els.levelHint.textContent = map[v] || '';
}
document.getElementById('levels').addEventListener('change', setLevelHint);
setLevelHint();

document.querySelectorAll('nav a').forEach(a=>{
  a.addEventListener('click', e=>{
    e.preventDefault();
    els.nav.forEach(n=>n.classList.remove('active'));
    a.classList.add('active');
    const view = a.dataset.view;
    els.views.forEach(v=>v.classList.toggle('active', v.id === `view-${view}`));
    if(view === 'status'){ pingHealth(); }
  });
});

function ui(msg, cls='') {
  els.status.className = `status ${cls}`;
  els.status.textContent = msg || '';
}

async function withTimeout(promise, ms=TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), ms);
  try { return await promise(ctrl.signal); }
  finally { clearTimeout(t); }
}

async function postJSON(path, body, signal) {
  const res = await fetch(`${API_BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>res.statusText);
    throw new Error(`${res.status} :: ${txt}`);
  }
  return res.json();
}

async function postAudio(path, body, signal) {
  const res = await fetch(`${API_BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>res.statusText);
    throw new Error(`${res.status} :: ${txt}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

els.btnMake.addEventListener('click', async ()=>{
  const level = Number(document.querySelector('input[name="level"]:checked').value);
  const minutes = Number(els.length.value || 5);
  const voice = els.voice.value;
  const rate = Number(els.rate.value || 1.0);
  const idea = (els.idea.value || '').trim();

  if (!idea) { ui('Skriv en kort idé först.', 'err'); return; }

  els.btnMake.disabled = true;
  els.btnDownload.disabled = true;
  ui('Skapar text…');

  try{
    const data = await withTimeout(
      (signal)=>postJSON('generate',{idea, level, minutes}, signal)
    );
    const text = (data && data.text || '').trim();
    if (!text) throw new Error('Tomt svar från textgenerering.');
    els.story.value = text;
    els.btnDownload.disabled = false;

    ui('Skapar röst…');
    const src = await withTimeout(
      (signal)=>postAudio('tts',{ text, voice, rate }, signal)
    );
    els.player.src = src;
    try { els.player.play(); } catch {}
    ui('Klar ✓', 'ok');
  } catch(err){
    ui(`Generate failed: ${err.message}`, 'err');
  } finally{
    els.btnMake.disabled = false;
  }
});

els.btnDownload.addEventListener('click', ()=>{
  const blob = new Blob([els.story.value || ''], {type:'text/plain;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'blush_narrative.txt';
  a.click();
  URL.revokeObjectURL(a.href);
});

async function pingHealth(){
  const pre = document.getElementById('health');
  pre.textContent = 'Kontrollerar…';
  try{
    const r = await fetch('/api/health');
    pre.textContent = await r.text();
  }catch(e){
    pre.textContent = 'Health check misslyckades.';
  }
}
