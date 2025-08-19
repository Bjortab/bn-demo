/* ========= Helpers & State ========= */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const KEY = 'bn-16';

const store = {
  load(){ try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return{}} },
  save(o){ localStorage.setItem(KEY, JSON.stringify(o)); }
};
const S = () => store.load();
const setS = p => { const s={...S(),...p}; store.save(s); return s; };

/* ========= Data ========= */
const stories  = window.BN_STORIES || [];
const chipsCfg = window.BN_CHIPS   || [];
const people   = window.BN_PEOPLE  || [];
const RAW_LIVE = !!window.RAW_MODE_LIVE;

/* ========= Spice (nivå 1–5) =========
   Viktigt: håller text icke-grafisk i demon. Level 5 använder mer direkt,
   varm och intensiv ton – men undviker explicita beskrivningar. */
function spice(text, lvl){
  switch(+lvl){
    case 1: return text
      .replace(/sensuell/gi,"mjuk")
      .replace(/beröring/gi,"varsam beröring");
    case 2: return text
      .replace(/beröring/gi,"varm beröring som dröjer kvar")
      .replace(/långsam/gi,"långsam och närvarande");
    case 3: return text
      .replace(/beröring/gi,"känslig beröring som guidar")
      .replace(/blickkontakt/gi,"långsam blickkontakt");
    case 4: return text
      .replace(/beröring/gi,"intensiv, fokuserad beröring där ni styr med ord");
    case 5:
      return RAW_LIVE
        ? text
           .replace(/långsam/gi,"medveten och laddad")
           .replace(/beröring/gi,"het, nära beröring som bjuder in mer") // fortfarande icke-grafiskt
           .replace(/guidning/gi,"tydliga, varma ord som leder")
        : text
           .replace(/sensuell/gi,"tydlig")
           .replace(/beröring/gi,"intensiv beröring");
    default: return text;
  }
}

/* ========= Röster (sv-SE default, visa-alla toggle) ========= */
const synth = window.speechSynthesis;
let showAllVoices = false;

function getVoices(){
  const v = synth?.getVoices?.() || [];
  if(showAllVoices) return v;
  const sv = v.filter(x=>/sv-SE/i.test(x.lang));
  return sv.length? sv : v; // fallback om device saknar sv-SE
}

function populateVoices(){
  const sel = $('#voiceSel'); if(!sel) return;
  const voices = getVoices();
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = ''; auto.textContent = 'Auto (sv-SE om möjligt)';
  sel.appendChild(auto);
  voices.forEach(v=>{
    const o = document.createElement('option');
    o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  });
  const saved = S().voice; if(saved) sel.value = saved;
  sel.onchange = ()=> { setS({voice: sel.value}); updateNowInfo(); };
  // spegla i Connect
  const vs2 = $('#voiceSel2'); if(vs2){ vs2.innerHTML = sel.innerHTML; vs2.value = sel.value; vs2.onchange = ()=>{ sel.value=vs2.value; sel.onchange(); }; }
}

if('speechSynthesis' in window){
  window.speechSynthesis.onvoiceschanged = populateVoices;
  setTimeout(populateVoices, 200);
}

$('#toggleVoices')?.addEventListener('click', (e)=>{
  showAllVoices = !showAllVoices;
  e.currentTarget.textContent = showAllVoices? 'Visa färre röster' : 'Visa alla röster';
  e.currentTarget.setAttribute('aria-expanded', String(showAllVoices));
  populateVoices();
});

/* ========= Player / TTS ========= */
let current = null, progressTimer = null;

function pickVoice(){
  const selVal = $('#voiceSel')?.value || $('#voiceSel2')?.value || '';
  const voices = getVoices();
  let v = voices.find(x => x.name === selVal) || voices.find(x=>/sv-SE/i.test(x.lang)) || voices[0];
  return v || null;
}

function textFor(a){
  const lvl = +(S().level||1);
  if(!a){
    // kort prov
    return (lvl<5)
      ? "Ett kort röstprov. Andas mjukt, landa i kroppen och låt orden vara varma och tydliga."
      : "Ett direkt röstprov. Andningen är djup, orden hänger kvar och tempot är medvetet och nära.";
  }
  return `${spice(a.title,lvl)}. ${spice(a.ingress,lvl)}. ${spice(a.body,lvl)}`;
}

function speak(text){
  if(!('speechSynthesis' in window)){ alert('Din webbläsare saknar talsyntes.'); return; }
  try{ synth.cancel(); }catch{}
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if(v) u.voice = v;
  u.lang = (v && v.lang) || 'sv-SE';
  u.rate = +($('#rate').value||1);
  u.onstart = startProgress;
  u.onend   = ()=> stopProgress(true);
  synth.speak(u);
  updateNowInfo();
}

function play(a){
  current = a || current;
  if(!current){
    $('#nowTitle').textContent = `Röstprov för nivå ${S().level||1}`;
    $('#nowSub').textContent   = 'Sensuell provläsning';
    speak(textFor(null)); return;
  }
  $('#nowTitle').textContent = spice(current.title, +(S().level||1));
  $('#nowSub').textContent   = 'Spelar upp...';
  speak(textFor(current));
}

function updateNowInfo(){
  const name = $('#voiceSel')?.selectedOptions?.[0]?.textContent?.split('(')[0]?.trim() || 'Auto';
  const rate = (+$('#rate').value||1).toFixed(2).replace(/\.00$/,'');
  $('#nowInfo').textContent = `Röst: ${name} • Tempo: ${rate}x`;
}

$('#btnPlay').addEventListener('click',()=>{
  if(synth.speaking && !synth.paused){ synth.pause(); stopProgress(); $('#btnPlay').textContent='Lyssna nu'; $('#nowSub').textContent='Pausad'; }
  else if(synth.paused){ synth.resume(); startProgress(); $('#btnPlay').textContent='⏸'; $('#nowSub').textContent='Spelar'; }
  else { play(current); $('#btnPlay').textContent='⏸'; }
});

$('#rate').addEventListener('input', ()=>{
  setS({rate:+$('#rate').value}); updateNowInfo();
  if(synth.speaking){ synth.cancel(); play(current); }
});

$('#back10').addEventListener('click', ()=> speak("Spolar tillbaka tio sekunder."));
$('#fwd10').addEventListener('click',  ()=> speak("Spolar fram tio sekunder."));
$('#voicePreview').addEventListener('click', ()=> speak("Detta är en kort provläsning med din valda röst."));

function startProgress(){
  $('#btnPlay').textContent='⏸'; $('#seek').value = 0;
  clearInterval(progressTimer);
  progressTimer = setInterval(()=>{
    const val = Math.min(100, (+$('#seek').value + 0.9));
    $('#seek').value = val;
  }, 200);
}
function stopProgress(done=false){
  clearInterval(progressTimer); progressTimer=null;
  if(done){ $('#seek').value = 0; $('#btnPlay').textContent='Lyssna nu'; $('#nowSub').textContent='Klar'; }
}

/* ========= Nivåer (1–5) & chips ========= */
function setLevel(l){
  setS({level:+l});
  $$('#createBox .lvl').forEach(b=> b.setAttribute('aria-pressed', b.dataset.lvl===String(l)));
  $('#nowTitle').textContent = `Röstprov för nivå ${l}`;
  render();
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
  c.querySelector('.title').textContent   = spice(a.title, lvl);
  c.querySelector('.ingress').textContent = spice(a.ingress, lvl);
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

/* ========= Generator (180–300 ord, nivåstyrt) =========
   OBS: Håller språket icke-grafiskt i demot. Level 5 är direktare/hetare men
   utan explicita beskrivningar. */
function generateStory(prompt, lvl){
  const base = (prompt||'En kväll som börjar stilla och blir varmare.').trim();
  const intro = [
    `Det börjar enkelt: ${base}.`, 
    `Ni landar tillsammans – ${base.toLowerCase()}.`,
    `Stämningen är tydlig från start: ${base.toLowerCase()}.`
  ][Math.floor(Math.random()*3)];

  const body1 = `Andningen blir långsammare. Blicken stannar lite längre. Orden blir mjuka och tydliga, som om varje mening vill framkalla mer närvaro.`;
  const body2 = (lvl<3)
    ? `Beröringen är varsam och omtänksam. Ni beskriver vad som känns tryggt, och det som känns bra får stanna kvar.`
    : (lvl<5)
      ? `Beröringen håller kvar värmen. Ni guidar med ord, testar tempo, pausar när kroppen säger till och fortsätter när det känns rätt.`
      : `Allt blir mer direkt och hett. Orden är varmare och mer uttrycksfulla, ni bjuder in mer – ändå lyhört och kontrollerat.`;

  const body3 = `Ni läser av små signaler: ett andetag, en rörelse, ett hummande svar. Värmen är där, ni styr tillsammans, inget forceras.`;
  const body4 = (lvl<3)
    ? `När stunden känns full, rundar ni av försiktigt. Ni håller om varandra, tackar för det som delades och låter lugnet bli kvar.`
    : (lvl<5)
      ? `När stunden mognar, saktar ni ned. Några sista ord – “mer här”, “precis så” – och en mjuk eftervård där ni landar tillsammans.`
      : `När intensiteten klingar av, stannar ni upp. Ni ger eftervård: vatten, hud mot hud, ett leende som säger allt.`;

  const out = [intro, body1, body2, body3, body4].join(' ');
  // sträva efter 180–300 ord (enkel utfyllnad om för kort)
  const target = 200;
  if(out.split(/\s+/).length < target){
    const pad = ` Ni tar tid på er. Varje liten paus blir en inbjudan. Det är tryggt, varmt och tydligt – bara ni två och det ni vill.`;
    return out + pad;
  }
  return out;
}

/* “Skapa” – generera + läs upp + visa modal + spara */
$('#btnGenerate').addEventListener('click', ()=>{
  const lvl = +(S().level||1);
  const text = generateStory($('#prompt').value, lvl);
  $('#mTitle').textContent   = `Skapad berättelse — nivå ${lvl}`;
  $('#mIngress').textContent = 'Texten läses upp automatiskt.';
  $('#mBody').textContent    = text;
  $('#genStatus').textContent = 'Skapad!';
  setTimeout(()=> $('#genStatus').textContent='', 1200);
  speak(text);
  $('#modal').showModal();

  // möjliggör sparning av genererade
  $('#mSave').onclick = ()=>{
    const item = { id: 'gen-'+Date.now(), lvl:[lvl], cats:['sensuellt'], title:`Egen berättelse (nivå ${lvl})`, ingress:text.slice(0,120)+'…', body:text };
    save(item);
    $('#modal').close();
  };
});
$('#closeModal').addEventListener('click', ()=> $('#modal').close());

/* ========= Connect ========= */
$('#openConnect').addEventListener('click',()=> openConnect());
$('#closeConnect').addEventListener('click',()=> closeConnect());
function openConnect(){ $('#connect').classList.add('active'); document.body.classList.add('no-scroll'); syncConnectUI(); }
function closeConnect(){ $('#connect').classList.remove('active'); document.body.classList.remove('no-scroll'); }

function syncConnectUI(){
  const s = S();
  // nivåknappar
  $$('#connect .lvl[data-lvl]').forEach(b=>{
    b.classList.toggle('active', +b.dataset.lvl===+(s.level||1));
    b.onclick = ()=> setLevel(b.dataset.lvl);
  });
  // röst spegling
  const vs2 = $('#voiceSel2');
  if(vs2){ vs2.innerHTML = $('#voiceSel').innerHTML; vs2.value = $('#voiceSel').value; vs2.onchange = ()=>{ $('#voiceSel').value=vs2.value; $('#voiceSel').onchange(); }; }
  // privacy
  $('#privacyChk').checked = !!s.privacy;
  $('#privacyChk').onchange = e => { setS({privacy:e.target.checked}); };
  // profil
  $('#alias').value = s.alias || '';
  $('#age').value   = s.age || '';
  $('#about').value = s.about || '';
  $('#alias').oninput = e=> setS({alias:e.target.value});
  $('#age').oninput   = e=> setS({age:+e.target.value||''});
  $('#about').oninput = e=> setS({about:e.target.value});

  // filter
  $$('#connect .lvl[data-filter]').forEach(b=>{
    b.classList.toggle('active', (s.filterLevel||'')===+b.dataset.filter);
    b.onclick = ()=>{
      const newVal = (+b.dataset.filter===s.filterLevel) ? '' : +b.dataset.filter;
      setS({filterLevel:newVal}); renderPeople();
    };
  });
  $('#prefFilter').value = s.prefFilter || '';
  $('#prefFilter').onchange = e=> { setS({prefFilter:e.target.value}); renderPeople(); };
}

/* Dela/importera preferenser */
$('#shareLink').addEventListener('click',()=>{
  const s = S();
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({
    level: s.level||1, voice: $('#voiceSel').value || '', privacy: !!s.privacy,
    alias: s.alias||'', age: s.age||'', about: s.about||''
  }))));
  const base = location.origin + location.pathname;
  const link = `${base}#bn=${payload}`;
  (navigator.clipboard?.writeText(link)||Promise.reject()).then(()=>{
    $('#shareStatus').textContent='Länk kopierad!'; setTimeout(()=> $('#shareStatus').textContent='', 1200);
  }).catch(()=>{ prompt('Kopiera länken:', link); });
});
(function importPrefsFromHash(){
  const m = location.hash.match(/#bn=([^&]+)/);
  if(!m) return;
  try{
    const obj = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    const merged = { ...S(), level: obj.level||1, privacy: !!obj.privacy, alias: obj.alias||'', age: obj.age||'', about: obj.about||'' };
    store.save(merged);
    setTimeout(()=> { if(obj.voice){ $('#voiceSel').value = obj.voice; setS({voice:obj.voice}); updateNowInfo(); } }, 300);
    history.replaceState(null, document.title, location.pathname + location.search);
  }catch{}
})();

/* ========= People ========= */
function renderPeople(){
  const wrap = $('#people'); if(!wrap) return;
  wrap.innerHTML='';
  const s = S();
  const list = people
    .filter(p => !s.filterLevel || p.level===s.filterLevel)
    .filter(p => !s.prefFilter || p.pref===s.prefFilter);
  const tpl = $('#person-tpl');
  list.forEach(p=>{
    const t = tpl.content.cloneNode(true);
    t.querySelector('.p-alias').textContent = p.alias;
    t.querySelector('.p-about').textContent = p.about;
    t.querySelector('.p-badge').textContent = `Nivå ${p.level} • ${p.pref}`;
    t.querySelector('.p-meta').textContent = 'Lokal demo — ingen riktig matchning ännu.';
    wrap.appendChild(t);
  });
}

/* ========= Bottom-nav ========= */
$('.bottom [data-tab="home"]').addEventListener('click', e=> setActiveTab(e.target));
$('.bottom [data-tab="feed"]').addEventListener('click', e=> { setActiveTab(e.target); window.scrollTo({top: $('#feed').offsetTop-60, behavior:'smooth'}); });
$('.bottom [data-tab="saved"]').addEventListener('click', e=> { setActiveTab(e.target); window.scrollTo({top: $('#saved').offsetTop-60, behavior:'smooth'}); });
function setActiveTab(btn){ $$('.bottom button').forEach(b=> b.classList.toggle('active', b===btn)); }

/* ========= Panic ========= */
$('#panic').addEventListener('click', e=>{
  e.preventDefault(); try{ (window.speechSynthesis||{}).cancel?.(); }catch{}
  window.location.href='https://www.google.se';
});

/* ========= Init ========= */
(function init(){
  const s = S();
  renderChips();
  setLevel(s.level||1);
  if(s.privacy){ $('#privacy').setAttribute('aria-pressed','true'); }
  const savedRate = +s.rate || 1; $('#rate').value = savedRate; updateNowInfo();
  populateVoices();
  render();
})();
