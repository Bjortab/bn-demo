// ===== Anropa API:t via Cloudflare Pages (byt om din domän skiljer sig) =====
const API_BASE = 'https://bn-demo01.pages.dev';

// UI-element
const els = {
  length:  document.getElementById('length'),
  spice:   document.getElementById('spice'),
  voice:   document.getElementById('voice'),
  words:   document.getElementById('words'),
  prompt:  document.getElementById('prompt'),
  btnPreview:  document.getElementById('btnPreview'),
  btnRead:     document.getElementById('btnRead'),
  btnDownload: document.getElementById('btnDownload'),
  status:  document.getElementById('status'),
  excerpt: document.getElementById('excerpt'),
  player:  document.getElementById('player'),
  spiceBadge: document.getElementById('spiceBadge'),
  spiceDesc:  document.getElementById('spiceDesc'),
};

// Ord/min beräkning
function calcWords(mins){ return mins*170; }
function updateWords(){ els.words.textContent = calcWords(Number(els.length.value)); }
['change','input'].forEach(evt=>els.length.addEventListener(evt, updateWords));
updateWords();

// Nivålabel → badge + beskrivning
const SPICE_TEXT = {
  1: { badge:'Nivå 1', desc:'romantisk & antydande', cls:'lvl-1' },
  2: { badge:'Nivå 2', desc:'mild med varm stämning', cls:'lvl-2' },
  3: { badge:'Nivå 3', desc:'sensuellt, icke-grafiskt', cls:'lvl-3' },
  4: { badge:'Nivå 4', desc:'hetare men smakfullt', cls:'lvl-4' },
  5: { badge:'Nivå 5', desc:'intensivt, passionerat', cls:'lvl-5' },
};
function renderSpice(){
  const n = Number(els.spice.value);
  const t = SPICE_TEXT[n] || SPICE_TEXT[2];
  els.spiceBadge.textContent = t.badge;
  els.spiceDesc.textContent  = t.desc;
  els.spiceBadge.className = `badge ${t.cls}`;
}
['change','input'].forEach(evt=>els.spice.addEventListener(evt, renderSpice));
renderSpice();

// Status
function uiStatus(msg, cls=''){
  els.status.className = `status ${cls}`;
  els.status.textContent = msg;
}

// Liten textutjämning för TTS-flyt
function mergeShortSentences(text){
  const s = text.replace(/\s+/g,' ')
                .replace(/([,;:])([^\s])/g, '$1 $2')
                .replace(/\.{2,}/g,'.');
  const parts = s.split(/(?<=[.!?])\s+/);
  const merged = [];
  for (let i=0;i<parts.length;i++){
    const p = parts[i].trim();
    if(!p) continue;
    if (p.split(' ').length <= 3 && merged.length){
      merged[merged.length-1] = merged[merged.length-1].replace(/[.!?]$/,'') + ', ' + p.charAt(0).toLowerCase()+p.slice(1);
    } else {
      merged.push(p);
    }
  }
  return merged.join(' ');
}

// API anrop (no-cache + cache-buster)
async function api(path, payload){
  const ts = Date.now();
  const res = await fetch(`${API_BASE}/api${path}?ts=${ts}`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Cache-Control':'no-store' },
    body: JSON.stringify(payload)
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error(`${res.status} ${t}`);
  }
  return res.json();
}

// Generera + TTS
async function generateAndSpeak(isPreview=false){
  try{
    uiStatus('Skapar text…');

    const mins  = Number(els.length.value);
    const spice = Number(els.spice.value);
    const voice = els.voice.value;
    const idea  = (els.prompt.value || '').trim();

    // Generera text
    const gen = await api('/generate', { mins, spice, idea, preview: isPreview });
    const rawText = gen?.text || '';
    const excerpt = gen?.excerpt || '';
    const smoothed = mergeShortSentences(rawText);

    // Visa utdrag
    els.excerpt.textContent = excerpt || smoothed.slice(0, 260) + '…';

    // Rensa ev. gammalt ljud och börja om
    els.player.pause();
    els.player.removeAttribute('src');
    els.player.load();

    uiStatus('Genererar tal…');

    // TTS (server → base64 MP3)
    const tts = await api('/tts', { text: smoothed, voice, rate: 1.0 });
    const url = `data:audio/mpeg;base64,${tts.audio}`;
    els.player.src = url;
    els.player.currentTime = 0;
    await els.player.play().catch(()=>{ /* autoplay block iOS */ });

    uiStatus('Klar ✓', 'ok');
  }catch(err){
    console.error(err);
    uiStatus(`Generate failed: ${err.message}`, 'err');
  }
}

els.btnPreview.addEventListener('click', () => generateAndSpeak(true));
els.btnRead.addEventListener('click',    () => generateAndSpeak(false));

els.btnDownload.addEventListener('click', () => {
  const text = els.excerpt.textContent || (els.prompt.value || '');
  if (!text.trim()){ uiStatus('Inget att ladda ner ännu.', 'err'); return; }
  const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'blush-narratives.txt';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});
