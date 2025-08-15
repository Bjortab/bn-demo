// ===== API-bas (relativ mot din Cloudflare Pages-domän) =====
const API_BASE = ''; // tom sträng → fetch('/api/...')

// ===== Element (alla ID finns i index.html) =====
const els = {
  length: document.getElementById('length'),
  spice:  document.getElementById('spice'),
  voice:  document.getElementById('voice'),
  words:  document.getElementById('words'),
  prompt: document.getElementById('prompt'),
  btnPreview:  document.getElementById('btnPreview'),
  btnRead:     document.getElementById('btnRead'),
  btnDownload: document.getElementById('btnDownload'),
  status:   document.getElementById('status'),
  excerpt:  document.getElementById('excerpt'),
  player:   document.getElementById('player'),
};

// Säkerhetsnät om sidan laddas utan compose-vy
for (const [k,v] of Object.entries(els)) {
  if (!v) console.warn('Saknar element:', k);
}

// ===== Hjälpare =====
function calcWords(mins){ return Math.max(1, Math.round(mins * 170)); }

function updateWords(){
  const mins = Number(els.length?.value || 5);
  const w = calcWords(mins);
  if (els.words) els.words.textContent = w.toString();
}

function uiStatus(msg, type=''){
  if (!els.status) return;
  els.status.textContent = msg || '';
  els.status.classList.remove('ok','err');
  if (type) els.status.classList.add(type);
}

async function api(path, payload, asBlob=false){
  const res = await fetch(`${API_BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    // Försök läsa feltext
    let errTxt = '';
    try { errTxt = await res.text(); } catch {}
    throw new Error(`HTTP ${res.status} – ${errTxt || res.statusText}`);
  }
  return asBlob ? await res.blob() : await res.json();
}

function getPayload(){
  const mins = Number(els.length?.value || 5);
  const level = Number(els.spice?.value || 2);
  const voice = (els.voice?.value || 'alloy');
  const idea  = (els.prompt?.value || '').trim();

  return {
    minutes: mins,
    spice:   level,
    voice,
    idea
  };
}

// ===== Huvudflöden =====
async function doGenerate(kind){ // kind: 'preview'|'read'
  try {
    uiStatus(kind === 'preview' ? 'Skapar förhandslyssning…' : 'Skapar berättelse och ljud…');

    // 1) Generera text
    const textRes = await api('generate', getPayload(), false);
    const { text, excerpt } = textRes || {};
    if (!text) throw new Error('Tomt svar från /api/generate');

    if (els.excerpt) els.excerpt.textContent = excerpt || text.slice(0, 280) + '…';

    // 2) Generera TTS (endast för “Läs upp”)
    if (kind === 'read') {
      const ttsBlob = await api('tts', { text, voice: getPayload().voice }, true);
      const url = URL.createObjectURL(ttsBlob);
      if (els.player) {
        els.player.src = url;
        els.player.play().catch(()=>{ /* autoplay kan blockeras */ });
      }
      uiStatus('Klar', 'ok');
    } else {
      uiStatus('Text klar (förhandsutdrag visas nedan).', 'ok');
    }
  } catch (err) {
    console.error(err);
    uiStatus(`Generate failed: ${err.message}`, 'err');
  }
}

function downloadTxt(){
  try{
    const idea = (els.prompt?.value || '').trim();
    const blob = new Blob([idea], { type:'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'berattelse.txt';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }catch(e){
    uiStatus('Kunde inte ladda ner texten.', 'err');
  }
}

// ===== Event-bindningar =====
if (els.length)  els.length.addEventListener('change', updateWords);
if (els.spice)   els.spice.addEventListener('change', ()=>{/* placerhållare för UI */});
if (els.voice)   els.voice.addEventListener('change', ()=>{/* byter röstval */});

if (els.btnPreview)  els.btnPreview.addEventListener('click', ()=>doGenerate('preview'));
if (els.btnRead)     els.btnRead.addEventListener('click',   ()=>doGenerate('read'));
if (els.btnDownload) els.btnDownload.addEventListener('click', downloadTxt);

// init
updateWords();
