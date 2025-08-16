// ===== API-bas (relativ, så det funkar på Pages) =====
const API_BASE = '/api';

// Elements
const els = {
  chkConsent: document.getElementById('chkConsent'),
  btnGoCreate: document.getElementById('btnGoCreate'),

  viewHome: document.getElementById('view-home'),
  viewCreate: document.getElementById('view-create'),

  length: document.getElementById('length'),
  spice: document.getElementById('spice'),
  spiceHint: document.getElementById('spiceHint'),
  voice: document.getElementById('voice'),
  words: document.getElementById('words'),

  prompt: document.getElementById('prompt'),
  btnPreview: document.getElementById('btnPreview'),
  btnRead: document.getElementById('btnRead'),
  btnDownload: document.getElementById('btnDownload'),

  status: document.getElementById('status'),
  player: document.getElementById('player'),
  excerpt: document.getElementById('excerpt'),
};

// Simple router (Hem/Skapa)
document.querySelectorAll('.navlink').forEach(a=>{
  a.addEventListener('click',(e)=>{
    e.preventDefault();
    const v = a.dataset.view || 'home';
    showView(v);
  });
});

function showView(name){
  const ok = name === 'create' ? els.chkConsent?.checked : true;
  els.viewHome.hidden = !(name === 'home');
  els.viewCreate.hidden = !(name === 'create');

  if (name === 'create' && !ok){
    // Om man försöker gå till skapa utan 18+
    uiStatus('Kryssa i 18+ först.', true);
    showView('home');
    return;
  }
  uiStatus('');
}

els.chkConsent?.addEventListener('change',()=>{
  els.btnGoCreate.disabled = !els.chkConsent.checked;
});

els.btnGoCreate?.addEventListener('click',()=>{
  if (!els.chkConsent.checked) return;
  showView('create');
  window.scrollTo({top:0,behavior:'smooth'});
});

// Words indicator & spice text
function calcWords(mins){ return 170 * Number(mins); }
function setWords(){ els.words.textContent = calcWords(els.length.value); }
function setSpiceHint(){
  const v = Number(els.spice.value);
  const map = {
    1:'Nivå 1 – mjuk romantik.',
    2:'Nivå 2 – mild med varm stämning.',
    3:'Nivå 3 – tydligt sensuellt språk.',
    4:'Nivå 4 – explicit (ej grafiskt).',
    5:'Nivå 5 – mest explicit (icke-grafiskt).'
  };
  els.spiceHint.textContent = map[v] || '';
}

[els.length, els.spice].forEach(el=>{
  el.addEventListener('input', ()=>{ setWords(); setSpiceHint(); });
});
setWords(); setSpiceHint();

// ===== Helpers =====
function uiStatus(msg, isErr=false){
  els.status.textContent = msg || '';
  els.status.classList.toggle('error', !!isErr);
  els.status.classList.toggle('ok', !!msg && !isErr);
}
function lockUI(lock){
  [els.btnPreview,els.btnRead,els.btnDownload].forEach(b=>{
    if (!b) return;
    b.disabled = lock;
    b.classList.toggle('isLoading', lock);
  });
}
function toBlobUrl(uint8, mime='audio/mpeg'){
  const blob = new Blob([uint8], { type: mime });
  return URL.createObjectURL(blob);
}

// Robust fetch with 60s timeout
async function api(path, payload, expectBinary=false){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), 60000);

  const res = await fetch(`${API_BASE}${path}`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(payload || {}),
    signal: ctrl.signal
  }).catch(err=>{
    clearTimeout(t); throw err;
  });
  clearTimeout(t);

  if (!res.ok){
    let detail = await res.text().catch(()=> '');
    throw new Error(`${res.status} ${res.statusText} :: ${detail}`);
  }

  return expectBinary ? new Uint8Array(await res.arrayBuffer())
                      : await res.json();
}

// ===== Actions =====
async function doGenerate(readAloud=false){
  const idea = (els.prompt.value || '').trim();
  if (!idea){ uiStatus('Skriv en idé först.', true); return; }

  const payload = {
    idea,
    minutes: Number(els.length.value),
    spice: Number(els.spice.value),
    voice: els.voice.value || 'alloy',
    readAloud
  };

  try{
    lockUI(true);
    uiStatus('Skapar berättelse...');

    const json = await api('/generate', payload, false);

    // Utdrag + (ev) ljud
    els.excerpt.value = json.excerpt || '';
    if (readAloud && json.audio){
      const bytes = Uint8Array.from(json.audio.data);
      const url = toBlobUrl(bytes, 'audio/mpeg');
      els.player.src = url;
      await els.player.play().catch(()=>{});
      uiStatus('Klart!', false);
    }else{
      uiStatus('Text klar.', false);
    }
  }catch(err){
    uiStatus(`Generate failed: ${err.message}`, true);
  }finally{
    lockUI(false);
  }
}

els.btnPreview.addEventListener('click', ()=> doGenerate(false));
els.btnRead.addEventListener('click',    ()=> doGenerate(true));

els.btnDownload.addEventListener('click', ()=>{
  const text = (els.excerpt.value || '').trim();
  if (!text){ uiStatus('Ingen text att spara.', true); return; }
  const blob = new Blob([text], { type:'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'berattelse.txt'; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 500);
});
