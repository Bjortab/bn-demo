// ===== KONFIG =====
const API_BASE = 'https://bn-worker.bjorta-bb.workers.dev/api/v1';
const WPM = 150; // svensk rimlig högläsning

// ===== DOM =====
const $ = (id)=>document.getElementById(id);
const $prompt=$('prompt'), $level=$('level'), $minutes=$('minutes');
const $ttsMode=$('ttsMode'), $gender=$('gender'), $rate=$('rate'), $pitch=$('pitch'), $vol=$('vol');
const $rateVal=$('rateVal'), $pitchVal=$('pitchVal'), $volVal=$('volVal');
const $go=$('go'), $stop=$('stop'), $player=$('player'), $out=$('out'), $msg=$('msg');
const $apiUrl=$('api-url'), $status=$('status'), $wordsHint=$('wordsHint');
$apiUrl.textContent = API_BASE;

// uppdatera hint
function updateWordsHint(){
  const mins = Number($minutes.value||5);
  $wordsHint.textContent = `≈ ${Math.round(mins*WPM)} ord mål`;
}
updateWordsHint();
$minutes.addEventListener('change', updateWordsHint);

// sliders
$rate.addEventListener('input', ()=> $rateVal.textContent = Number($rate.value).toFixed(2));
$pitch.addEventListener('input',()=> $pitchVal.textContent= Number($pitch.value).toFixed(2));
$vol.addEventListener('input',  ()=> $volVal.textContent  = Number($vol.value).toFixed(2));

// ===== Utils =====
function setBusy(on){
  $go.disabled = on;
  $stop.disabled = on ? true : (speechSynthesis.speaking || !$player.paused);
  $msg.textContent = on ? 'Jobbar…' : '';
  $msg.className='api';
}
function ok(t){ $msg.textContent=t; $msg.className='api ok'; }
function err(t){ $msg.textContent=t; $msg.className='api err'; }

function sentences(text){
  return text
    .replace(/\s+/g,' ')
    .split(/(?<=[.!?…])\s+(?=[^\s])/u)
    .map(s=>s.trim()).filter(Boolean);
}
function tidy(text){
  const s = sentences(text);
  const seen = new Set(); const keep=[];
  for (const x of s){
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    keep.push(/[.!?…]$/.test(x)?x:x+'.');
  }
  const paras=[];
  for (let i=0;i<keep.length;i+=3) paras.push( keep.slice(i,i+3).join(' ') );
  return paras;
}
function render(text){
  const paras = tidy(text||'');
  $out.innerHTML = paras.length ? paras.map(p=>`<p>${p}</p>`).join('') : '';
}

// ===== Init /status =====
(async function(){
  try{
    const r = await fetch(`${API_BASE}/status`);
    const j = await r.json().catch(()=> ({}));
    if (j?.ok) { $status.textContent = `ok: ${j.worker} • v=${j.v} • Mistral`; ok('API klart.'); }
    else { $status.textContent='status: fel'; err('Kunde inte läsa status.'); }
  }catch{ $status.textContent='status: fel'; err('Kunde inte nå API.'); }
})();

// ===== TTS (browser) =====
let voices = [];
function loadVoices(){ voices = speechSynthesis.getVoices(); }
if ('speechSynthesis' in window){
  loadVoices(); speechSynthesis.onvoiceschanged = loadVoices;
}
function pickVoice(gender='female'){
  const sv = voices.filter(v => (v.lang||'').toLowerCase().startsWith('sv'));
  if (!sv.length) return null;
  const pref = sv.find(v => gender==='female' ? /female|anna|helena|astrid/i.test(v.name) : /male|erik|gustav|matt/i.test(v.name))
           || sv[0];
  return pref;
}
let currentUtterance = null;
function speakBrowser(text, gender){
  if (!('speechSynthesis' in window)) { err('Webbläsarröst saknas.'); return; }
  // avbryt ev. pågående
  speechSynthesis.cancel();
  currentUtterance = new SpeechSynthesisUtterance(text);
  const v = pickVoice(gender); if (v) currentUtterance.voice = v;
  currentUtterance.lang='sv-SE';
  currentUtterance.rate = Number($rate.value);
  currentUtterance.pitch= Number($pitch.value);
  currentUtterance.volume=Number($vol.value);
  currentUtterance.onend = ()=>{ $stop.disabled = true; };
  $stop.disabled = false;
  speechSynthesis.speak(currentUtterance);
}
function stopAll(){
  try{ speechSynthesis?.cancel?.(); }catch{}
  try{ if (!$player.paused) { $player.pause(); $player.currentTime=0; } }catch{}
  $stop.disabled = true;
}
$stop.addEventListener('click', stopAll);

// ===== Generate =====
$go.addEventListener('click', async ()=>{
  const prompt = ($prompt.value||'').trim();
  if (!prompt){ err('Skriv en prompt först.'); $prompt.focus(); return; }

  setBusy(true);
  stopAll();
  $out.innerHTML='';

  const payload = {
    prompt,
    minutes: Number($minutes.value||5),
    level: Number($level.value||2),
    lang: 'sv',
    temperature: 0.8
  };

  try{
    const r = await fetch(`${API_BASE}/episodes/generate`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `${r.status} ${r.statusText}`);

    render(j.text);
    ok(`Klar: ~${j.words} ord (${j.minutes} min)`);

    if ($ttsMode.value==='browser') {
      const plain = Array.from($out.querySelectorAll('p')).map(p=>p.textContent).join(' ');
      speakBrowser(plain, $gender.value);
    }
  }catch(e){
    err(e.message||String(e));
  }finally{
    setBusy(false);
  }
});
