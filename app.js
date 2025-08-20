// BN build v19 — cache-bust
console.log("BN build v19");

// Avregistrera ev. gamla service workers (undvik cache-låsningar)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(rs => rs.forEach(r => r.unregister()))
    .catch(()=>{});
}

/* ========= Helpers & State ========= */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const KEY = 'bn-19';

const store = {
  load(){ try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return{}} },
  save(o){ localStorage.setItem(KEY, JSON.stringify(o)); }
};
const S = () => store.load();
const setS = p => { const s={...S(),...p}; store.save(s); return s; };

/* ========= Config ========= */
const RAW_LIVE = !!window.RAW_MODE_LIVE;
const OPENAI_MODEL = window.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_VOICES = window.OPENAI_VOICES || ["alloy","verse","luna"];

/* ========= Data ========= */
const stories  = window.BN_STORIES || [];
const chipsCfg = window.BN_CHIPS   || [];
const people   = window.BN_PEOPLE  || [];

/* ========= UI refs ========= */
const audioEl = $('#audio');

/* ========= Lokal API-nyckel ========= */
function getApiKey(){
  try{ return localStorage.getItem("OPENAI_API_KEY") || ""; } catch { return ""; }
}
function setApiKey(k){
  try{
    if(k) localStorage.setItem("OPENAI_API_KEY", k);
    else  localStorage.removeItem("OPENAI_API_KEY");
  }catch{}
}
function hasOpenAI(){ return !!getApiKey(); }

/* ========= Intensitet (1–5) ========= */
function intensify(text, lvl){
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

  const saved = S().voice; if(saved) sel.value = saved;
  sel.onchange = ()=> { setS({voice: sel.value}); updateNowInfo(); };

  const vs2 = $('#voiceSel2');
  if(vs2){ vs2.innerHTML = sel.innerHTML; vs2.value = sel.value; vs2.onchange = ()=>{ sel.value=vs2.value; sel.onchange(); }; }
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

  let text = [intro,p2,p3,p4,p5].join(' ');
  text = intensify(text, lvl);

  const targetWords = {1: 180, 3: 450, 5: 750}[minutes] || 180;
  while(text.split(/\s+/).length < targetWords){
    text += ' ' + intensify(`Ta tid på er. Låt pauserna bjuda in. Säg vad du vill ha. Andas tillsammans och håll kvar när det känns rätt.`, lvl);
  }
  return text;
}

/* ========= TTS (OpenAI eller Web Speech) ========= */
let current = null, progressTimer = null;
const audioElRef = $('#audio');

function updateNowInfo(){
  const name = $('#voiceSel')?.value || 'Auto';
  const rate = (+$('#rate').value||1).toFixed(2).replace(/\.00$/,'');
  $('#nowInfo').textContent = `Röst: ${name || 'Auto'} • Tempo: ${rate}x`;
}

async function speakOpenAI(text){
  const key   = getApiKey();
  const voice = $('#voiceSel').value || OPENAI_VOICES[0] || 'alloy';
  const rate  = +($('#rate').value||1);

  const res = await fetch("https://api.openai.com/v1/audio/speech",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${key}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({ model: OPENAI_MODEL, voice, input: text })
  });
  if(!res.ok){ throw new Error("OpenAI TTS misslyckades"); }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  audioElRef.src = url;
  audioElRef.playbackRate = rate;
  await audioElRef.play();
  startAudioProgress();
}

function startAudioProgress(){
  clearInterval(progressTimer);
  progressTimer = setInterval(()=>{
    if(!audioElRef.duration || isNaN(audioElRef.duration)) return;
    const pct = (audioElRef.currentTime / audioElRef.duration) * 100;
    $('#seek').value = Math.min(100, Math.max(0, pct));
  }, 200);
}
function stopAudioProgress(done=false){
  clearInterval(progressTimer); progressTimer=null;
  if(done){ $('#seek').value = 0; $('#btnPlay').textContent='Lyssna nu'; $('#nowSub').textContent='Klar'; }
}

// Web Speech fallback (estimerad progress)
function getBrowserVoice(){
  const selVal = $('#voiceSel')?.value || '';
  const voices = getBrowserVoices();
  return voices.find(x=>x.name===selVal) || voices.find(x=>/sv-SE/i.test(x.lang)) || voices[0] || null;
}
function speakBrowser(text){
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = getBrowserVoice();
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
  const wpm   = 150 * rate;
  const total = (words / wpm) * 60 * 1000;
  const t0 = performance.now();
  progressTimer = setInterval(()=>{
    const elapsed = performance.now() - t0;
    const pct = Math.min(100, (elapsed/total)*100);
    $('#seek').value = pct;
  }, 200);
}
function stopEstimatedProgress(done=false){
  clearInterval(progressTimer); progressTimer=null;
  if(done){ $('#seek').value = 0; $('#btnPlay').textContent='Lyssna nu'; $('#nowSub').textContent='Klar'; }
}

async function speak(text){
  $('#btnPlay').textContent='⏸';
  $('#nowSub').textContent='Spelar upp...';
  try{
    if(hasOpenAI()) { await speakOpenAI(text); }
    else { speakBrowser(text); }
  }catch(e){
    console.error(e);
    alert("Kunde inte spela upp med OpenAI. Faller tillbaka till inbyggd TTS.");
    speakBrowser(text);
  }
}

/* Spela vald berättelse eller röstprov */
function play(a){
  current = a || current;
  if(!current){
    $('#nowTitle').textContent = `Röstprov för nivå ${S().level||1}`;
    speak(generateText("Ett kort röstprov", S().level||1, 1));
    return;
  }
  $('#nowTitle').textContent = intensify(current.title, S().level||1);
  speak(generateText(`${current.title}. ${current.ingress}`, S().level||1, 1));
}

/* Player UI */
$('#btnPlay').addEventListener('click', async ()=>{
  if(hasOpenAI()){
    if(!audioElRef.paused && !audioElRef.ended){ audioElRef.pause(); $('#btnPlay').textContent='Lyssna nu'; $('#nowSub').textContent='Pausad'; return; }
    if(audioElRef.paused && audioElRef.src){ await audioElRef.play(); $('#btnPlay').textContent='⏸'; $('#nowSub').textContent='Spelar'; return; }
  }else{
    if(synth.speaking && !synth.paused){ synth.pause(); stopEstimatedProgress(); $('#btnPlay').textContent='Lyssna nu'; $('#nowSub').textContent='Pausad'; return; }
    if(synth.paused){ synth.resume(); startEstimatedProgress(" ", +($('#rate').value||1)); $('#btnPlay').textContent='⏸'; $('#nowSub').textContent='Spelar'; return; }
  }
  play(current);
});
$('#rate').addEventListener('input', ()=>{
  setS({rate:+$('#rate').value}); updateNowInfo();
  if(hasOpenAI()){
    if(!audioElRef.paused && audioElRef.src) { audioElRef.playbackRate = +($('#rate').value||1); }
  }else if(synth.speaking){
    synth.cancel(); stopEstimatedProgress(); play(current);
  }
});
$('#back10').addEventListener('click', ()=>{ if(hasOpenAI()&&audioElRef.duration){ audioElRef.currentTime=Math.max(0,audioElRef.currentTime-10);} });
$('#fwd10').addEventListener('click',  ()=>{ if(hasOpenAI()&&audioElRef.duration){ audioElRef.currentTime=Math.min(audioElRef.duration,audioElRef.currentTime+10);} });
$('#voicePreview').addEventListener('click', ()=>{ speak(generateText("Detta är en kort provläsning", S().level||1, 1)); });
audioElRef.addEventListener('timeupdate', ()=>{ if(!audioElRef.duration) return; $('#seek').value=(audioElRef.currentTime/audioElRef.duration)*100; });
audioElRef.addEventListener('ended', ()=> stopAudioProgress(true));

/* ========= Nivåer & chips ========= */
function setLevel(l){
  setS({level:+l});
  $$('#createBox .lvl').forEach(b=> b.setAttribute('aria-pressed', b.dataset.lvl===String(l)));
  $('#nowTitle').textContent = `Röstprov för nivå ${l}`;
}
$$('#createBox .lvl').forEach(b=> b.addEventListener('click',()=> setLevel(b.dataset.lvl)));

function renderChips(){
  const wrap = $('#chips'); wrap.innerHTML='';
  chipsCfg.forEach(c=>{
    const el = document.createElement('button');
    el.className = 'chip'; el.textContent = c.label; el.dataset.id = c.id;
    el.onclick = ()=>{
      el.classList.toggle('active');
      const ids = $$('#chips .chip.active').map(x=>x.dataset.id);
      setS({chips: ids}); render();
    };
    wrap.appendChild(el);
  });
  (S().chips||[]).forEach(id => $(`#chips .chip[data-id="${id}"]`)?.classList.add('active'));
}

/* ========= Flöde ========= */
const tpl = $('#card-tpl');
function card(el, a, lvl){
  const c = tpl.content.cloneNode(true);
  c.querySelector('.title').textContent   = intensify(a.title, lvl);
  c.querySelector('.ingress').textContent = intensify(a.ingress, lvl);
  c.querySelector('.save').addEventListener('click',()=>save(a));
  c.querySelector('.open').addEventListener('click',()=>play(a));
  el.appendChild(c);
}
function render(){
  const lvl = +(S().level||1);
  const activeChips = S().chips||[];
  const byLvl   = a => a.lvl?.includes(lvl);
  const byChips = a => activeChips.length ? (a.cats||[]).some(x=>activeChips.includes(x)) : true;

  $('#feed').innerHTML  = '';
  $('#saved').innerHTML = '';
  stories.filter(byLvl).filter(byChips).forEach(a=> card($('#feed'), a, lvl));
  (S().saved||[]).forEach(a=> card($('#saved'), a, lvl));
  renderPeople();
}
function save(a){
  const s = S(); s.saved = s.saved||[];
  if(!s.saved.find(x=>x.id===a.id)) s.saved.push(a);
  setS({saved:s.saved}); render();
}

/* ========= Skapa ========= */
$('#btnGenerate').addEventListener('click', async ()=>{
  const lvl = +(S().level||1);
  const minutes = +($('input[name="len"]:checked')?.value || 1);
  const text = generateText($('#prompt').value, lvl, minutes);

  $('#mTitle').textContent   = `Skapad berättelse — nivå ${lvl}`;
  $('#mIngress').textContent = `Längd ca ${minutes} min • nivå ${lvl}`;
  $('#mBody').textContent    = text;
  $('#modal').showModal();

  // Autoplay direkt
  speak(text);
});
$('#closeModal').addEventListener('click', ()=> $('#modal').close());
$('#mSave').addEventListener('click', ()=>{
  const a = {id:'gen-'+Date.now(), lvl:[S().level||1], cats:['sensuellt'], title:'Egen berättelse', ingress:'Skapad i BN', body: $('#mBody').textContent};
  save(a); $('#modal').close();
});

/* ========= Connect (öppna/stäng/backdrop/back) ========= */
const sheet = $('#connect');
function openConnect(){ sheet.classList.add('active'); document.body.classList.add('no-scroll'); sheet.setAttribute('aria-hidden','false'); history.pushState({bn:'connect'},''); }
function closeConnect(){ sheet.classList.remove('active'); document.body.classList.remove('no-scroll'); sheet.setAttribute('aria-hidden','true'); if(history.state?.bn==='connect') history.back(); }
$('#openConnect').addEventListener('click', openConnect);
$('#closeConnect').addEventListener('click', closeConnect);
$('#connectBackdrop').addEventListener('click', closeConnect);
window.addEventListener('popstate', ()=>{ if(history.state?.bn==='connect') closeConnect(); });

/* API-key UI */
$('#saveApiKey').addEventListener('click', ()=>{
  const val = ($('#apiKeyInput').value||"").trim();
  if(!/^sk-/.test(val)){ $('#apiKeyStatus').textContent='Ogiltig nyckel'; setTimeout(()=>$('#apiKeyStatus').textContent='', 1500); return; }
  setApiKey(val);
  $('#apiKeyInput').value = '';
  $('#apiKeyStatus').textContent='Sparad lokalt!';
  setTimeout(()=>$('#apiKeyStatus').textContent='', 1500);
  populateVoices(); // växla röstlista till OpenAI-läget
});
$('#clearApiKey').addEventListener('click', ()=>{
  setApiKey('');
  $('#apiKeyStatus').textContent='Rensad';
  setTimeout(()=>$('#apiKeyStatus').textContent='', 1500);
  populateVoices(); // tillbaka till webbläsarröster
});

function renderPeople(){
  const root = $('#people'); root.innerHTML='';
  const fLevel = (S().connectFilterLevel||0);
  const fPref  = (S().connectPref||'');
  people
    .filter(p=> !fLevel || p.level===+fLevel)
    .filter(p=> !fPref || p.pref===fPref)
    .forEach(p=>{
      const t = $('#person-tpl').content.cloneNode(true);
      t.querySelector('.p-alias').textContent = p.alias;
      t.querySelector('.p-badge').textContent = `Nivå ${p.level}`;
      t.querySelector('.p-about').textContent = p.about;
      t.querySelector('.p-meta').textContent = `Gillar: ${p.pref}`;
      root.appendChild(t);
    });
}
$('#prefFilter').addEventListener('change', e=>{ setS({connectPref:e.target.value}); renderPeople(); });
$$('#connect .lvl[data-filter]').forEach(b=> b.addEventListener('click',()=>{
  const v = +b.dataset.filter; setS({connectFilterLevel:v}); renderPeople();
}));

/* ========= Delning ========= */
$('#shareLink').addEventListener('click', async ()=>{
  const lvl = S().level||1; const voice = S().voice||'';
  const priv = $('#privacy').getAttribute('aria-pressed')==='true';
  const url = new URL(location.href);
  url.searchParams.set('lvl', lvl);
  if(voice) url.searchParams.set('voice', voice);
  url.searchParams.set('priv', priv? '1':'0');
  try{
    await navigator.clipboard.writeText(url.toString());
    $('#shareStatus').textContent = 'Länk kopierad!';
    setTimeout(()=>$('#shareStatus').textContent='', 2000);
  }catch{
    alert(url.toString());
  }
});

/* ========= Bottennav + Panik ========= */
$('.bottom [data-tab="home"]').addEventListener('click', ()=> window.scrollTo({top:0,behavior:'smooth'}));
$('.bottom [data-tab="feed"]').addEventListener('click', ()=> $('#feed').scrollIntoView({behavior:'smooth'}));
$('.bottom [data-tab="saved"]').addEventListener('click', ()=> $('#saved').scrollIntoView({behavior:'smooth'}));
$('#panic').addEventListener('click', ()=>{
  try{ audioElRef.pause(); }catch{}
  try{ synth.cancel(); }catch{}
  alert("Panikläge: uppspelning stoppad.");
});

/* ========= Integritetsläge ========= */
$('#privacy').addEventListener('click', (e)=>{
  const on = e.currentTarget.getAttribute('aria-pressed')!=='true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  setS({privacy:on});
});

/* ========= Init ========= */
(function init(){
  setLevel(S().level||1);
  $('#rate').value = S().rate||1;
  updateNowInfo();
  populateVoices();
  renderChips();
  render();

  // Import från delningslänk
  const sp = new URLSearchParams(location.search);
  if(sp.has('lvl')) setLevel(sp.get('lvl'));
  if(sp.has('voice')) { setS({voice:sp.get('voice')}); populateVoices(); }
  if(sp.get('priv')==='1'){ $('#privacy').setAttribute('aria-pressed','true'); setS({privacy:true}); }
})();
