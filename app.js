/* ========= Helpers & State ========= */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const KEY = 'bn-17';

const store = {
  load(){ try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return{}} },
  save(o){ localStorage.setItem(KEY, JSON.stringify(o)); }
};
const S = () => store.load();
const setS = p => { const s={...S(),...p}; store.save(s); return s; };

/* ========= Config ========= */
const RAW_LIVE = !!window.RAW_MODE_LIVE;
const OPENAI_KEY   = window.OPENAI_API_KEY || "";
const OPENAI_MODEL = window.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_VOICES = window.OPENAI_VOICES || ["alloy","verse","luna"];

/* ========= Data ========= */
const stories  = window.BN_STORIES || [];
const chipsCfg = window.BN_CHIPS   || [];
const people   = window.BN_PEOPLE  || [];

/* ========= UI refs ========= */
const audioEl = $('#audio');

/* ========= Intensitet (1–5) ========= */
function intensify(text, lvl){
  // Gör nivåerna tydliga. 5 = varm/direkt, men ej grafiskt i demon.
  switch(+lvl){
    case 1: return text.replace(/sensuell/gi,"mjuk").replace(/beröring/gi,"varsam beröring");
    case 2: return text.replace(/beröring/gi,"varm beröring som dröjer kvar").replace(/långsam/gi,"långsam och närvarande");
    case 3: return text.replace(/beröring/gi,"känslig beröring som guidar").replace(/blickkontakt/gi,"långsam blickkontakt");
    case 4: return text.replace(/beröring/gi,"intensiv, fokuserad beröring där ni styr med ord");
    case 5:
      return RAW_LIVE
        ? text
           .replace(/långsam/gi,"medveten och laddad")
           .replace(/beröring/gi,"het, nära beröring som bjuder in mer")
           .replace(/ord/gi,"ord som leder tydligt och varmt")
        : text.replace(/sensuell/gi,"tydlig").replace(/beröring/gi,"intensiv beröring");
    default: return text;
  }
}

/* ========= Röster ========= */
const synth = window.speechSynthesis;
let showAllVoices = false;

function hasOpenAI(){ return !!OPENAI_KEY; }
function getBrowserVoices(){
  const v = synth?.getVoices?.() || [];
  if(showAllVoices) return v;
  const sv = v.filter(x=>/sv-SE/i.test(x.lang));
  return sv.length? sv : v;
}
function populateVoices(){
  const sel = $('#voiceSel'); if(!sel) return;
  sel.innerHTML = '';

  if(hasOpenAI()){
    // Visa OpenAI-favoriter + “Auto”
    const auto = document.createElement('option'); auto.value=''; auto.textContent='Auto (OpenAI standard)';
    sel.appendChild(auto);
    OPENAI_VOICES.forEach(name=>{
      const o = document.createElement('option'); o.value = name; o.textContent = name;
      sel.appendChild(o);
    });
  }else{
    const voices = getBrowserVoices();
    const auto = document.createElement('option'); auto.value=''; auto.textContent='Auto (sv-SE om möjligt)';
    sel.appendChild(auto);
    voices.forEach(v=>{
      const o = document.createElement('option'); o.value=v.name; o.textContent=`${v.name} (${v.lang})`; sel.appendChild(o);
    });
  }

  // spara/återställ
  const saved = S().voice; if(saved) sel.value = saved;
  sel.onchange = ()=> { setS({voice: sel.value}); updateNowInfo(); };

  // spegla i Connect
  const vs2 = $('#voiceSel2'); if(vs2){ vs2.innerHTML = sel.innerHTML; vs2.value = sel.value; vs2.onchange = ()=>{ sel.value=vs2.value; sel.onchange(); }; }
}
if('speechSynthesis' in window){
  window.speechSynthesis.onvoiceschanged = ()=>{ if(!hasOpenAI()) populateVoices(); };
  setTimeout(()=>{ if(!hasOpenAI()) populateVoices(); }, 200);
}
$('#toggleVoices')?.addEventListener('click',(e)=>{
  if(hasOpenAI()){ alert("OpenAI-läge visar redan en kuraterad röstlista."); return; }
  showAllVoices = !showAllVoices;
  e.currentTarget.textContent = showAllVoices? 'Visa färre röster' : 'Visa alla röster';
  e.currentTarget.setAttribute('aria-expanded', String(showAllVoices));
  populateVoices();
});

/* ========= Generator ========= */
function generateText(prompt, lvl, minutes){
  const base = (prompt||'En kväll som börjar stilla och blir varmare.').trim();
  const intro = [
    `Det börjar enkelt: ${base}.`, 
    `Ni landar tillsammans – ${base.toLowerCase()}.`,
    `Stämningen är tydlig från start: ${base.toLowerCase()}.`
  ][Math.floor(Math.random()*3)];

  const p2 = `Andningen blir långsammare. Blicken stannar längre. Orden blir mjuka och tydliga — varje mening kallar fram mer närvaro.`;
  const p3 = (lvl<3)
    ? `Beröringen är varsam och omtänksam. Ni beskriver vad som känns tryggt, och det som känns bra får stanna kvar.`
    : (lvl<5)
      ? `Beröringen håller kvar värmen. Ni guidar med ord, testar tempo, pausar när kroppen säger till och fortsätter när det känns rätt.`
      : `Allt blir mer direkt och hett. Orden är varmare och mer uttrycksfulla, ni bjuder in mer — lyhört och kontrollerat.`;

  const p4 = `Ni läser små signaler: ett andetag, en rörelse, ett hummande svar. Värmen är där, ni styr tillsammans.`;
  const p5 = (lvl<3)
    ? `När stunden känns full, rundar ni av försiktigt. Ni håller om varandra och låter lugnet bli kvar.`
    : (lvl<5)
      ? `När stunden mognar, saktar ni ned. Några sista ord — “mer här”, “precis så” — och en mjuk eftervård där ni landar.`
      : `När intensiteten klingar av, stannar ni upp. Eftervård: vatten, hud mot hud, ett leende som säger allt.`;

  // Bastext
  let text = [intro,p2,p3,p4,p5].join(' ');
  text = intensify(text, lvl);

  // Önska längd (ca ord/min ~150 * tempo 1.0). Vi gör enkel uppfyllnad.
  const targetWords = {1: 180, 3: 450, 5: 750}[minutes] || 180;
  while(text.split(/\s+/).length < targetWords){
    text += ' ' + intensify(`Ta tid på er. Låt pauserna bjuda in. Säg vad du vill ha. Andas tillsammans och håll kvar när det känns rätt.`, lvl);
  }
  return text;
}

/* ========= TTS play (OpenAI eller Web Speech) ========= */
let current = null, progressTimer = null;

function updateNowInfo(){
  const name = $('#voiceSel')?.value || 'Auto';
  const rate = (+$('#rate').value||1).toFixed(2).replace(/\.00$/,'');
  $('#nowInfo').textContent = `Röst: ${name || 'Auto'} • Tempo: ${rate}x`;
}

async function speakOpenAI(text){
  // Skapar riktig mp3 via OpenAI TTS och spelar i <audio>
  const voice = $('#voiceSel').value || OPENAI_VOICES[0] || 'alloy';
  const rate  = +($('#rate').value||1);
  const body = {
    model: OPENAI_MODEL,
    voice,
    input: text
  };
  // fetch
  const res = await fetch("https://api.openai.com/v1/audio/speech",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${OPENAI_KEY}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify(body)
  });
  if(!res.ok){ throw new Error("OpenAI TTS misslyckades"); }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  audioEl.src = url;
  audioEl.playbackRate = rate;
  await audioEl.play();
  startAudioProgress();
}

function startAudioProgress(){
  clearInterval(progressTimer);
  progressTimer = setInterval(()=>{
    if(!audioEl.duration || isNaN(audioEl.duration)) return;
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    $('#seek').value = Math.min(100, Math.max(0, pct));
  }, 200);
}
function stopAudioProgress(done=false){
  clearInterval(progressTimer); progressTimer=null;
  if(done){ $('#seek').value = 0; $('#btnPlay').textContent='Lyssna nu'; $('#nowSub').textContent='Klar'; }
}

// Web Speech fallback (estimerad progress)
function pickBrowserVoice(){
  const selVal = $('#voiceSel')?.value || '';
  const voices = getBrowserVoices();
  return voices.find(x=>x.name===selVal) || voices.find(x=>/sv-SE/i.test(x.lang)) || voices[0] || null;
}
function speakBrowser(text){
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickBrowserVoice();
  if(v) u.voice = v;
  u.lang = (v && v.lang) || 'sv-SE';
  u.rate = +($('#rate').value||1);
  u.onstart = startEstimatedProgress.bind(null, text, u.rate);
  u.onend   = ()=> stopEstimatedProgress(true);
  synth.speak(u);
  updateNowInfo();
}

function startEstimatedProgress(text, rate){
  $('#btnPlay').textContent='⏸'; $('#nowSub').textContent='Spelar upp...';
  $('#seek').value = 0;
  clearInterval(progressTimer);
  const words = text.split(/\s+/).length;
  const wpm   = 150 * rate; // ungefär
  const total = (
