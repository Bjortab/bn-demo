const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const KEY = 'bn-15';

// ----- Persistens -----
const store = {
  load(){ try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return{}} },
  save(o){ localStorage.setItem(KEY, JSON.stringify(o)); }
};
const S = () => store.load();
const setS = p => { const s={...S(),...p}; store.save(s); return s; };

// ----- Data -----
const stories   = window.BN_STORIES || [];
const chipsCfg  = window.BN_CHIPS   || [];
const people    = window.BN_PEOPLE  || [];

// ----- Nivå 1–5 → språkspice -----
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
    case 5: return text
      .replace(/sensuell/gi,"het")
      .replace(/beröring/gi,"utforskande och explicit beröring");
    default: return text;
  }
}

// ----- Chips -----
function renderChips(){
  const wrap = $('#chips'); wrap.innerHTML='';
  chipsCfg.forEach(c=>{
    const el = document.createElement('button');
    el.className = 'chip';
    el.textContent = c.label;
    el.dataset.id = c.id;
    el.onclick = ()=>{
      el.classList.toggle('active');
      const ids = $$('#chips .chip.active').map(x=>x.dataset.id);
      setS({chips: ids}); render();
    };
    wrap.appendChild(el);
  });
  (S().chips||[]).forEach(id => $(`#chips .chip[data-id="${id}"]`)?.classList.add('active'));
}

// ----- Cards/Feed -----
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

// ----- TTS -----
const synth = window.speechSynthesis;
let current = null, progressTimer = null;

function pickVoice(){
  const selVal = $('#voiceSel').value || $('#voiceSel2').value || '';
  const voices = synth?.getVoices?.() || [];
  const sv = voices.filter(v=> /sv-SE/i.test(v.lang));
  let v = sv[0] || voices.find(v=>/sv/i.test(v.lang)) || voices[0];
  const exact = voices.find(x => x.name === selVal);
  if(exact) v = exact;
  return v || null;
}
function populateVoices(){
  const sel = $('#voiceSel'); if(!sel) return;
  const voices = synth?.getVoices?.() || [];
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = ''; auto.textContent = 'Auto (sv-SE om möjligt)';
  sel.appendChild(auto);
  const order = voices.sort((a,b)=> (b.lang==='sv-SE') - (a.lang==='sv-SE'));
  order.forEach(v=>{
    const o = document.createElement('option'); o.value = v.name; o.textContent = `${v.name} (${v.lang})`; sel.appendChild(o);
  });
  const saved = S().voice; if(saved) sel.value = saved;
  sel.onchange = ()=> setS({voice: sel.value});
}
if('speechSynthesis' in window){
  window.speechSynthesis.onvoiceschanged = populateVoices;
  setTimeout(populateVoices, 200);
}

function textFor(a){
  const lvl = +(S().level||1);
  if(!a) return "Detta är ett kort prov. Andas mjukt, landa i kroppen och låt orden vara varma och tydliga.";
  return `${spice(a.title,lvl)}. ${spice(a.ingress,lvl)}. ${spice(a.body,lvl)}`;
}
function speak(text){
  if(!('speechSynthesis' in window)){ alert('Din webbläsare saknar talsyntes.'); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if(v) u.voice = v;
  u.lang = (v && v.lang) || 'sv-SE';
  u.rate = +($('#rate').value||1);
  u.onstart = startProgress;
  u.onend   = ()=> stopProgress(true);
  synth.speak(u);
}
function play(a){
  current = a || current;
  if(!current){
    $('#nowTitle').textContent = 'Röstprov';
    $('#nowSub').textContent   = 'Sensuell provläsning';
    speak(textFor(null)); return;
  }
  $('#nowTitle').textContent = spice(current.title, +(S().level||1));
  $('#nowSub').textContent   = 'Spelar upp...';
  speak(textFor(current));
}

// Player UI
$('#btnPlay').addEventListener('click',()=>{
  if(synth.speaking && !synth.paused){ synth.pause(); stopProgress(); $('#btnPlay').textContent='▶'; $('#nowSub').textContent='Pausad'; }
  else if(synth.paused){ synth.resume(); startProgress(); $('#btnPlay').textContent='⏸'; $('#nowSub').textContent='Spelar'; }
  else { play(current); $('#btnPlay').textContent='⏸'; }
});
$('#rate').addEventListener('input', ()=>{
  setS({rate:+$('#rate').value});
  if(synth.speaking){ synth.cancel(); play(current); }
});
$('#back10').addEventListener('click', ()=> speak("Spolar tillbaka tio sekunder."));
$('#fwd10').addEventListener('click',  ()=> speak("Spolar fram tio sekunder."));
$('#voicePreview').addEventListener('click', ()=> speak("Detta är en kort provläsning med din valda röst."));

// Progress (visuell)
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
  if(done){ $('#seek').value = 0; $('#btnPlay').textContent='▶'; $('#nowSub').textContent='Klar'; }
}

// ----- Nivåval & privacy -----
function setLevel(l){
  setS({level:+l});
  $$('.onboarding .lvl').forEach(b=> b.setAttribute('aria-pressed', b.dataset.lvl===String(l)));
  render();
}
$$('.onboarding .lvl').forEach(b=> b.addEventListener('click',()=> setLevel(b.dataset.lvl)));
$('#privacy').addEventListener('click',()=>{
  const val = !S().privacy;
  setS({privacy:val});
  $('#privacy').setAttribute('aria-pressed', String(val));
  render();
});

// ----- Bottom nav -----
$('.bottom [data-tab="home"]').addEventListener('click', e=> setActiveTab(e.target));
$('.bottom [data-tab="feed"]').addEventListener('click', e=> { setActiveTab(e.target); window.scrollTo({top: $('#feed').offsetTop-60, behavior:'smooth'}); });
$('.bottom [data-tab="saved"]').addEventListener('click', e=> { setActiveTab(e.target); window.scrollTo({top: $('#saved').offsetTop-60, behavior:'smooth'}); });
function setActiveTab(btn){ $$('.bottom button').forEach(b=> b.classList.toggle('active', b===btn)); }

// ----- Connect -----
$('#openConnect').addEventListener('click',()=> openConnect());
$('#closeConnect').addEventListener('click',()=> closeConnect());
function openConnect(){ $('#connect').classList.add('active'); syncConnectUI(); }
function closeConnect(){ $('#connect').classList.remove('active'); }
function syncConnectUI(){
  const s = S();
  $$('#connect .lvl[data-lvl]').forEach(b=>{
    b.classList.toggle('active', +b.dataset.lvl===+(s.level||1));
    b.onclick = ()=> setLevel(b.dataset.lvl);
  });
  const vs2 = $('#voiceSel2');
  vs2.innerHTML = $('#voiceSel').innerHTML;
  vs2.value = $('#voiceSel').value;

  $('#privacyChk').checked = !!s.privacy;
  $('#privacyChk').onchange = e => { setS({privacy:e.target.checked}); render(); };

  $('#alias').value = s.alias || '';
  $('#age').value   = s.age || '';
  $('#about').value = s.about || '';
  $('#alias').oninput = e=> setS({alias:e.target.value});
  $('#age').oninput   = e=> setS({age:+e.target.value||''});
  $('#about').oninput = e=> setS({about:e.target.value});

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

// Dela/importera preferenser
$('#shareLink').addEventListener('click',()=>{
  const s = S();
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({
    level: s.level||1, voice: $('#voiceSel').value || '', privacy: !!s.privacy, alias: s.alias||'', age: s.age||'', about: s.about||''
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
    setTimeout(()=> { if(obj.voice){ $('#voiceSel').value = obj.voice; setS({voice:obj.voice}); } }, 300);
    history.replaceState(null, document.title, location.pathname + location.search);
  }catch{}
})();

// ----- People -----
function renderPeople(){
  const wrap = $('#people'); if(!wrap) return;
  wrap.innerHTML='';
  const s = S();
  const list = people
    .filter(p => !s.filterLevel || p.level===s.filterLevel)
    .filter(p => !s.prefFilter || p.pref===s.prefFilter);
  list.forEach(p=>{
    const t = $('#person-tpl').content.cloneNode(true);
    t.querySelector('.p-alias').textContent = p.alias;
    t.querySelector('.p-about').textContent = p.about;
    t.querySelector('.p-badge').textContent = `Nivå ${p.level} • ${p.pref}`;
    t.querySelector('.p-meta').textContent = 'Lokal demo – ingen riktig matchning ännu.';
    wrap.appendChild(t);
  });
}

// ----- Create (premium gate) -----
$('#btnGenerate').addEventListener('click', ()=>{
  $('#premiumGate').textContent = 'Premium krävs i demot — låst just nu.';
});

// ----- Panic -----
$('#panic').addEventListener('click', e=>{
  e.preventDefault(); try{ (window.speechSynthesis||{}).cancel?.(); }catch{}
  window.location.href='https://www.google.se';
});

// ----- Init -----
(function init(){
  const s = S();
  renderChips();
  setLevel(s.level||1);
  if(s.privacy){ $('#privacy').setAttribute('aria-pressed','true'); }
  const savedRate = +s.rate || 1; $('#rate').value = savedRate;
  populateVoices();
  render();
})();
