// ======= KONFIG =======
const API_BASE = 'https://bn-worker.bjorta-bb.workers.dev/api/v1';

// ======= DOM =======
const $ = (id) => document.getElementById(id);
const $prompt = $('prompt');
const $level  = $('level');
const $words  = $('words');
const $lang   = $('lang');
const $ttsMode= $('ttsMode');
const $gender = $('gender');
const $rate   = $('rate');
const $pitch  = $('pitch');
const $vol    = $('vol');
const $rateVal= $('rateVal');
const $pitchVal=$('pitchVal');
const $volVal = $('volVal');

const $go     = $('go');
const $stop   = $('stop');
const $player = $('player');
const $out    = $('out');
const $msg    = $('msg');
const $status = $('status');
const $apiUrl = $('api-url');

$apiUrl.textContent = API_BASE;
$rate.addEventListener('input', ()=> $rateVal.textContent = Number($rate.value).toFixed(2));
$pitch.addEventListener('input',()=> $pitchVal.textContent= Number($pitch.value).toFixed(2));
$vol.addEventListener('input',  ()=> $volVal.textContent  = Number($vol.value).toFixed(2));

// ======= HJÄLPARE =======
function setBusy(on) {
  $go.disabled = on;
  $stop.disabled = on ? true : (speechSynthesis.speaking || !!$player.src);
  $msg.textContent = on ? 'Jobbar…' : '';
  $msg.className = 'api';
}
function ok(t){ $msg.textContent=t; $msg.className='api ok'; }
function err(t){ $msg.textContent=t; $msg.className='api err'; }

function sentences(text) {
  // grov men praktisk split för svenska
  return text
    .replace(/\s+/g,' ')
    .split(/(?<=[.!?…])\s+(?=[^\s])/u)
    .map(s=>s.trim())
    .filter(Boolean);
}

function dedupeAndTidy(text) {
  // ta bort triviala upprepningar (”vi möttes … vi möttes …”)
  const parts = sentences(text);
  const seen = new Set();
  const cleaned = [];
  for (const s of parts) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // säkerställ avslutning
    const fixed = /[.!?…]$/.test(s) ? s : s + '.';
    // inled med versal
    cleaned.push(fixed.charAt(0).toUpperCase() + fixed.slice(1));
  }
  // gruppera 2–3 meningar per stycke
  const paras = [];
  for (let i=0;i<cleaned.length;i+=3) {
    paras.push(cleaned.slice(i, i+3).join(' '));
  }
  return paras;
}

function renderStory(text) {
  const paras = dedupeAndTidy(text);
  $out.innerHTML = paras.map(p=>`<p>${p}</p>`).join('');
}

// ======= INIT /status =======
(async function init(){
  try{
    const r = await fetch(`${API_BASE}/status`);
    const j = await r.json().catch(()=> ({}));
    if (j?.ok) {
      $status.textContent = `ok: worker=${j.worker} • v=${j.v} • tts=${(j.tts?.elevenlabs?'elevenlabs':'browser') || 'none'}`;
      ok('API klart.');
    } else {
      $status.textContent = 'status: fel';
      err('Kunde inte läsa status från API.');
    }
  }catch{
    $status.textContent = 'status: fel';
    err('Kunde inte nå API (status).');
  }
})();

// ======= WEBBLÄSAR-RÖST =======
let voices = [];
function loadVoices() {
  voices = speechSynthesis.getVoices();
}
loadVoices();
if (typeof speechSynthesis !== 'undefined'){
  speechSynthesis.onvoiceschanged = loadVoices;
}
function pickSwedishVoice(gender='female'){
  const sv = voices.filter(v => (v.lang||'').toLowerCase().startsWith('sv'));
  if (!sv.length) return null;
  // prioritera "Natural" & könsnamn i titeln om möjligt
  const pref = sv.find(v => /natural/i.test(v.name) && (gender==='female' ? /female|anna|helena|astrid/i.test(v.name) : /male|erik|gustav|matt/i.test(v.name)))
            || sv.find(v => gender==='female' ? /female|anna|helena|astrid/i.test(v.name) : /male|erik|gustav|matt/i.test(v.name))
            || sv[0];
  return pref;
}
function speakBrowser(text, gender) {
  if (!('speechSynthesis' in window)) { err('Webbläsarröst saknas i denna miljö.'); return; }
  speechSynthesis.cancel();
  const v = pickSwedishVoice(gender);
  const u = new SpeechSynthesisUtterance(text);
  if (v) u.voice = v;
  u.lang = 'sv-SE';
  u.rate = Number($rate.value);
  u.pitch = Number($pitch.value);
  u.volume = Number($vol.value);
  u.onend = ()=> { $stop.disabled = true; };
  $stop.disabled = false;
  speechSynthesis.speak(u);
}

// ======= GENERERA =======
$go.addEventListener('click', async () => {
  const prompt = ($prompt.value||'').trim();
  if (!prompt) { err('Skriv en prompt först.'); $prompt.focus(); return; }

  const payload = {
    prompt,
    level : Number($level.value||2),
    lang  : $lang.value || 'sv',
    words : Number($words.value||220),
    // stilkrav för Workern – håller sig inom dina riktlinjer
    style : {
      temperature: 0.8,
      avoid_cliches: true,
      avoid_repetition: true,
      tone_female: "sensuell, mjuk men självsäker",
      tone_male:   "maskulin, varm och respektfull",
      swedish: true,
      paragraphing: true
    },
    voice : $gender.value // om Workern använder server-TTS
  };

  // rensa UI
  setBusy(true);
  $out.innerHTML = '';
  $player.pause(); $player.removeAttribute('src'); $player.style.display='none';
  speechSynthesis?.cancel?.();

  try{
    const res = await fetch(`${API_BASE}/episodes/generate`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });

    let data = null;
    try { data = await res.json(); } catch { data = null; }

    if (!res.ok) {
      throw new Error(data?.error || `${res.status} ${res.statusText}`);
    }
    if (!data?.ok) throw new Error(data?.error || 'Okänt fel från API.');

    // TEXT
    const text = (data.text||'').trim();
    renderStory(text || '(tomt svar)');
    ok('Klar!');

    // TTS
    const mode = $ttsMode.value;
    if (mode === 'browser') {
      // Läs upp *den rensade texten* (paragrafer → plain)
      const plain = Array.from($out.querySelectorAll('p')).map(p=>p.textContent).join(' ');
      speakBrowser(plain, $gender.value);
    } else if (data.audio_url) {
      $player.src = data.audio_url;
      $player.style.display = 'block';
      try { await $player.play(); } catch {}
    } else {
      $stop.disabled = true;
    }

  }catch(e){
    err(e.message || String(e));
  }finally{
    setBusy(false);
  }
});

$stop.addEventListener('click', () => {
  speechSynthesis?.cancel?.();
  $player.pause();
  $player.currentTime = 0;
  $stop.disabled = true;
});
