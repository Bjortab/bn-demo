// ===== API-bas (CORS) =====
const API_BASE = 'https://bn-demo01.pages.dev'; // <-- din Cloudflare Pages-domän

const els = {
  length: document.getElementById('length'),
  levelHint: document.getElementById('levelHint'),
  voice: document.getElementById('voice'),
  words: document.getElementById('words'),
  prompt: document.getElementById('prompt'),
  btnPreview: document.getElementById('btnPreview'),
  btnRead: document.getElementById('btnRead'),
  btnDownload: document.getElementById('btnDownload'),
  status: document.getElementById('status'),
  excerpt: document.getElementById('excerpt'),
  player: document.getElementById('player'),
  levelGroup: document.getElementById('levelGroup'),
};

function getSelectedLevel() {
  const checked = document.querySelector('input[name="level"]:checked');
  return checked ? Number(checked.value) : 2;
}

function calcWords(mins){ return Math.max(60, Math.round(mins * 170)); }
function uiStatus(msg, state=''){ els.status.textContent = msg || ''; els.status.className = `status ${state}`; }

function updateMetaUI(){
  const mins = Number(els.length.value || 5);
  els.words.textContent = calcWords(mins);
  const level = getSelectedLevel();
  const hints = {
    1: 'Nivå 1 – romantiskt och antydande.',
    2: 'Nivå 2 – mild med varm stämning.',
    3: 'Nivå 3 – sensuellt och tydligt.',
    4: 'Nivå 4 – hett, direkt språk (ej grafiskt).',
    5: 'Nivå 5 – mycket hett och explicit (ej grafiskt, alltid samtycke).',
  };
  els.levelHint.textContent = hints[level] || '';
}
updateMetaUI();
[els.length, els.levelGroup].forEach(el => el.addEventListener('change', updateMetaUI));

async function apiPost(path, payload){
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), 45000); // 45s safeguard
  try{
    const res = await fetch(`${API_BASE}${path}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    if(!res.ok){
      const txt = await res.text().catch(()=> '');
      throw new Error(`${res.status} ${res.statusText} :: ${txt.slice(0,300)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function generateAndTTS(){
  els.btnRead.disabled = true; els.btnPreview.disabled = true;
  uiStatus('Genererar text …');

  const idea = (els.prompt.value || '').trim();
  if(!idea){ uiStatus('Skriv en idé först.', 'err'); els.btnRead.disabled = false; els.btnPreview.disabled = false; return; }

  const minutes = Number(els.length.value || 5);
  const level = getSelectedLevel();
  const voice = els.voice.value || 'alloy';

  try{
    // 1) Generera text
    const gen = await apiPost('/api/generate',{ idea, minutes, level });
    const story = (gen && gen.text) ? gen.text.trim() : '';
    if(!story) throw new Error('Tomt svar från text-API.');

    // visa utdrag
    els.excerpt.textContent = story.slice(0, 600) + (story.length > 600 ? ' …' : '');
    uiStatus('Skapar röst …');

    // 2) TTS
    const audioRes = await fetch(`${API_BASE}/api/tts`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ text: story, voice }),
    });
    if(!audioRes.ok){
      const t = await audioRes.text().catch(()=> '');
      throw new Error(`TTS misslyckades: ${audioRes.status} ${audioRes.statusText} :: ${t.slice(0,200)}`);
    }
    const blob = await audioRes.blob();
    els.player.src = URL.createObjectURL(blob);
    els.player.play().catch(()=>{ /* användaren måste ibland trycka play */ });
    uiStatus('Klart! Tryck play om ljudet inte startar automatiskt.', 'ok');
  } catch(err){
    uiStatus(`Generate failed: ${err.message}`, 'err');
  } finally {
    els.btnRead.disabled = false; els.btnPreview.disabled = false;
  }
}

// Förhandslyssna = kortare text (1 minut)
els.btnPreview.addEventListener('click', async ()=>{
  const keep = els.length.value;
  els.length.value = '1';
  await generateAndTTS();
  els.length.value = keep;
  updateMetaUI();
});
els.btnRead.addEventListener('click', generateAndTTS);

// Ladda ner TXT
els.btnDownload.addEventListener('click', async ()=>{
  const idea = (els.prompt.value || '').trim();
  if(!idea){ uiStatus('Skriv en idé först.', 'err'); return; }
  const minutes = Number(els.length.value || 5);
  const level = getSelectedLevel();
  try{
    uiStatus('Genererar text …');
    const gen = await apiPost('/api/generate',{ idea, minutes, level });
    const story = (gen && gen.text) ? gen.text.trim() : '';
    if(!story) throw new Error('Tomt svar.');
    const blob = new Blob([story], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'berattelse.txt'; a.click();
    URL.revokeObjectURL(url);
    uiStatus('Text nedladdad.', 'ok');
  } catch(err){
    uiStatus(`Generate failed: ${err.message}`, 'err');
  }
});
