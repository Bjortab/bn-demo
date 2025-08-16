<script>
// ========= BN robust frontend =========
const API_BASE = location.origin;

// Hjälpare: hitta element
function findEl(selectors){ for(const s of selectors){ const el=document.querySelector(s); if(el) return el; } return null; }
function findButtonByText(text){ 
  text = text.toLowerCase().trim(); 
  const candidates = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));
  return candidates.find(b => (b.textContent||b.value||'').toLowerCase().includes(text)) || null;
}

// Stoppa alla form-submits
document.addEventListener('submit', e => { e.preventDefault(); e.stopPropagation(); }, true);

// Samla referenser – tål variationer
const els = {
  minutes:  findEl(['#length','select[name="length"]','[data-length]']),
  levelRadios: document.querySelectorAll('input[name="level"]'),
  levelWrap: findEl(['.snusk','#snusk','[data-snusk]']),
  voice:    findEl(['#voice','select[name="voice"]']),
  idea:     findEl(['#idea','#user-idea','#prompt','textarea[name="idea"]','input[name="idea"]','.idea-input']),
  btnPreview: findEl(['#btnPreview','button[data-action="preview"]']) || findButtonByText('förhandslyssna'),
  btnRead:    findEl(['#btnRead','#btnGenerate','button[data-action="read"]']) || findButtonByText('läs upp'),
  btnDownload:findEl(['#btnDownload','button[data-action="download"]']),
  status:   findEl(['#status','.status']),
  excerpt:  findEl(['#excerpt','.excerpt']),
  player:   findEl(['#player','audio'])
};

function uiStatus(msg, err=false){ if(!els.status) return; els.status.textContent=msg; els.status.style.color= err? '#ef7070':'#9c6d7b'; }
function getVal(el){ return el && 'value' in el ? String(el.value).trim() : ''; }
function getMinutes(){ const n=Number(getVal(els.minutes)||'5'); return (Number.isFinite(n)&&n>0)?n:5; }
function getLevel(){
  if(els.levelRadios && els.levelRadios.length){ const c=[...els.levelRadios].find(r=>r.checked); if(c&&c.value) return Number(c.value); }
  if(els.levelWrap){ const a=els.levelWrap.querySelector('[data-level].active'); if(a) return Number(a.getAttribute('data-level')); }
  return 2;
}
function setExcerpt(t){ if(els.excerpt) els.excerpt.textContent=t||''; }
function setAudioBlob(blob){ if(!els.player) return; const url=URL.createObjectURL(blob); els.player.src=url; els.player.load(); }

async function apiPost(path, payload, asBlob=false, signal){
  const res = await fetch(`${API_BASE}${path}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal
  });
  if(!res.ok){ const txt=await res.text().catch(()=> ''); throw new Error(`${res.status} :: ${txt||res.statusText}`); }
  return asBlob? res.blob() : res.json();
}

async function handleGenerate(preview=false){
  try{
    const controller = new AbortController(); const {signal}=controller;

    const idea = getVal(els.idea);
    if(!idea){ uiStatus('Skriv en idé först.', true); return; }

    const minutes = getMinutes();
    const level   = getLevel();
    const voice   = getVal(els.voice) || 'alloy';

    uiStatus('Genererar text …');
    const gen = await apiPost('/api/generate', { idea, minutes, level }, false, signal);
    const { text, excerpt } = gen || {};
    if(!text) throw new Error('Tomt svar från textgenerering.');
    setExcerpt(excerpt || (text.slice(0,300)+' …'));

    if(preview){ uiStatus('Förhandsvisning klar. Tryck ”Läs upp” för ljud.'); return; }

    uiStatus('Skapar ljud …');
    const wav = await apiPost('/api/tts', { text, voice }, true, signal);
    setAudioBlob(wav);
    uiStatus('Klart!');
  }catch(err){
    console.error(err);
    uiStatus(`Generate failed: ${err.message||err}`, true);
  }
}

// Koppla events (fångar både click/pointer/touch)
['click','pointerup','touchend'].forEach(ev=>{
  els.btnPreview && els.btnPreview.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); handleGenerate(true); }, {passive:false});
  els.btnRead    && els.btnRead.addEventListener(ev,    e=>{ e.preventDefault(); e.stopPropagation(); handleGenerate(false);}, {passive:false});
});

// Fallback om knappar inte hittades initialt (ex. SPA som byter DOM)
const lateWire = () => {
  if(!els.btnRead){ const b=findButtonByText('läs upp'); if(b){ els.btnRead=b; ['click','pointerup','touchend'].forEach(ev=> b.addEventListener(ev, e=>{e.preventDefault();handleGenerate(false);}, {passive:false})); } }
  if(!els.btnPreview){ const p=findButtonByText('förhandslyssna'); if(p){ els.btnPreview=p; ['click','pointerup','touchend'].forEach(ev=> p.addEventListener(ev, e=>{e.preventDefault();handleGenerate(true);}, {passive:false})); } }
};
document.addEventListener('DOMContentLoaded', lateWire);
setTimeout(lateWire, 800);
</script>
