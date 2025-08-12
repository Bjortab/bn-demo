const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const KEY = 'bn-13';

// ------- State -------
const store = {
  load(){ try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return{}} },
  save(o){ localStorage.setItem(KEY, JSON.stringify(o)); }
};
const S = () => store.load();
const setS = p => { const s={...S(),...p}; store.save(s); return s; };

// ------- Data -------
const stories = window.BN_STORIES || [];
const chipsCfg = window.BN_CHIPS || [];
const peopleDemo = window.BN_PEOPLE || [];

// ------- Språkfilter (nivå 1/3/5) -------
function spice(text, lvl){
  if(lvl===1) return text
    .replace(/beröring/gi,"varsam beröring")
    .replace(/sensuell/gi,"mjuk");
  if(lvl===3) return text
    .replace(/beröring/gi,"känslig beröring som stannar kvar")
    .replace(/landning/gi,"landning och värme");
  // lvl 5
  return text
    .replace(/beröring/gi,"utforskande, het beröring där ni guidar varandra")
    .replace(/ögonkontakt/gi,"långsam blickkontakt som håller kvar värmen");
}

// ------- Chips -------
function renderChips(){
  const wrap = $('#chips'); wrap.innerHTML='';
  chipsCfg.forEach(c=>{
    const el = document.createElement('button');
    el.className = 'chip';
    el.textContent = c.label;
    el.dataset.id = c.id;
    el.onclick = ()=>{
      const act = el.classList.toggle('active');
      const activeIds = $$('#chips .chip.active').map(x=>x.dataset.id);
      setS({chips: activeIds});
      render();
    };
    wrap.appendChild(el);
  });
  (S().chips||[]).forEach(id=>{
    const el = $(`#chips .chip[data-id="${id}"]`);
    if(el) el.classList.add('active');
  });
}

// ------- Cards -------
const tpl = $('#card-tpl');
function card(el, a, i, lvl){
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
  const byChips = a => activeChips.length ? (a.cats||[]).some(x=>activeChips.includes(x)) : true;

  $('#feed').innerHTML = '';
  stories.filter(a=>a.lvl.includes(lvl)).filter(byChips).forEach((a,i)=> card($('#feed'),a,i,lvl));

  $('#saved').innerHTML = '';
  (S().saved||[]).forEach((a,i)=> card($('#saved'),a,i,lvl));

  renderPeople();
}
function save(a){
  const s = S(); s.saved = s.saved||[];
  if(!s.saved.find(x=>x.id===a.id)) s.saved.push(a);
  setS({saved:s.saved}); render();
}

// ------- Player / TTS -------
const synth = window.speechSynthesis;
let current = null, progressTimer = null;

function pickVoice(){
  const selVal = $('#voiceSel').value || $('#voiceSel2').value || '';
  const voices = synth.getVoices();
  const sv = voices.filter(v=> /sv-SE/i.test(v.lang));
  let v = sv[0] || voices.find(v=>/sv/i.test(v.lang)) || voices[0];
  const exact = voices.find(x => x.name === selVal);
  if(exact) v = exact;
  return v || null;
}

function textFor(a){
  const lvl = +(S().level||1);
  return `${spice(a.title,lvl)}. ${spice(a.ingress,lvl)}. ${spice(a.body,lvl)}`;
}

function speak(text){
  if(!('speechSynthesis' in window)){ alert('Din webbläsare saknar talsyntes.'); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if(v) u.voice = v;
  u.lang = (v && v.lang) || 'sv-SE';
  u.rate = +$('#rate').value || 1;
  u.onstart = startProgress;
  u.onend   = ()=> stopProgress(true);
  synth.speak(u);
}

function play(a){
  current = a;
  $('#nowTitle').textContent = spice(a.title, +(S().level||1));
  $('#nowSub').textContent   = 'Spelar upp...';
  speak(textFor(a));
}
$('#btnPlay').addEventListener('click',()=>{
  if(synth.speaking && !synth.paused){ synth.pause(); stopProgress(); $('#btnPlay').textContent='▶'; $('#nowSub').textContent='Pausad'; }
  else if(synth.paused){ synth.resume(); startProgress(); $('#btnPlay').textContent='⏸'; $('#nowSub').textContent='Spelar'; }
  else if(current){ play(current); $('#btnPlay').textContent='⏸'; }
});
$('#back10').addEventListener('click', ()=> previewLine("Spolar tillbaka 10 sekunder.")); // placeholder
$('#fwd10').addEventListener('click',  ()=> previewLine("Spolar fram 10 sekunder."));     // placeholder

function startProgress(){
  $('#btnPlay').textContent='⏸';
  $('#seek').value = 0;
  clearInterval(progressTimer);
  progressTimer = setInterval(()=>{
    const val = Math.min(100, (+$('#seek').value + 0.8));
    $('#seek').value = val;
  }, 250);
}
function stopProgress(done=false){
  clearInterval(progressTimer); progressTimer=null;
  if(done){ $('#seek').value = 0; $('#btnPlay').textContent='▶'; $('#nowSub').textContent='Klar'; }
}
function previewLine(txt){ speak(txt); }
$('#voicePreview').addEventListener('click', ()=> previewLine("Detta är en kort provläsning med din valda röst."));

// ------- Levels & privacy -------
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

// ------- Bottom nav (scroll till sektioner) -------
$('.bottom [data-tab="home"]').addEventListener('click', e=> setActiveTab(e.target));
$('.bottom [data-tab="feed"]').addEventListener('click', e=> { setActiveTab(e.target); window.scrollTo({top: document.querySelector('#feed').offsetTop-60, behavior:'smooth'}); });
$('.bottom [data-tab="saved"]').addEventListener('click', e=> { setActiveTab(e.target); window.scrollTo({top: document.querySelector('#saved').offsetTop-60, behavior:'smooth'}); });
function setActiveTab(btn){
  $$('.bottom button').forEach(b=> b.classList.toggle('active', b===btn));
}

// ------- Connect sheet -------
$('#openConnect').addEventListener('click',()=> openConnect());
$('#closeConnect').addEventListener('click',()=> closeConnect());
function openConnect(){ $('#connect').classList.add('active'); syncConnectUI(); }
function closeConnect(){ $('#connect').classList.remove('active'); }

function syncConnectUI(){
  const s = S();
  // nivåknappar i sheet
  $$('#connect .lvl[data-lvl]').forEach(b=>{
    b.classList.toggle('active', +b.dataset.lvl===+(s.level||1));
    b.onclick = ()=> setLevel(b.dataset.lvl);
  });
  // röster (spegla huvudlistan)
  const vs2 = $('#voiceSel2');
  vs2.innerHTML = $('#voiceSel').innerHTML;
  vs2.value = $('#voiceSel').value;
  $('#privacyChk').checked = !!s.privacy;
  $('#privacyChk').onchange = e => { setS({privacy:e.target.checked}); render(); };

  // profil
  $('#alias').value = s.alias || '';
  $('#age').value   = s.age || '';
  $('#about').value = s.about || '';
  $('#alias').oninput = e=> setS({alias:e.target.value});
  $('#age').oninput   = e=> setS({age:+e.target.value||''});
  $('#about').oninput = e=> setS({about:e.target.value});

  // filter-knappar för personer
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

// Dela preferenser via Base64 i hash
$('#shareLink').addEventListener('click',()=>{
  const s = S();
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({
    level: s.level||1,
    voice: $('#voiceSel').value || '',
    privacy: !!s.privacy,
    alias: s.alias||'',
    age: s.age||'',
    about: s.about||''
  }))));
  const base = location.origin + location.pathname;
  const link = `${base}#bn=${payload}`;
  (navigator.clipboard?.writeText(link)||Promise.reject()).then(()=>{
    $('#shareStatus').textContent='Länk kopierad!';
    setTimeout(()=> $('#shareStatus').textContent='', 1200);
  }).catch(()=>{ prompt('Kopiera länken:', link); });
});

// Importera preferenser från hash
(function importPrefsFromHash(){
  const m = location.hash.match(/#bn=([^&]+)/);
  if(!m) return;
  try{
    const obj = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    const merged = {
      ...S(),
      level: obj.level||1,
      privacy: !!obj.privacy,
      alias: obj.alias||'',
      age: obj.age||'',
      about: obj.about||''
    };
    store.save(merged);
    setTimeout(()=> { if(obj.voice){ $('#voiceSel').value = obj.voice; setS({voice:obj.voice}); } }, 300);
    history.replaceState(null, document.title, location.pathname + location.search);
  }catch{}
})();

// ------- Röster (Web Speech API) -------
function populateVoices(){
  const sel = $('#voiceSel');
  const voices = (window.speechSynthesis||{}).getVoices?.() || [];
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = ''; auto.textContent = 'Auto (sv-SE om möjligt)';
  sel.appendChild(auto);
  const sv = voices.filter(v=>/sv-SE/i.test(v.lang));
  const others = voices.filter(v=>!/sv-SE/i.test(v.lang));
  sv.concat(others).forEach(v=>{
    const o = document.createElement('option');
    o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  });
  const saved = S().voice;
  if(saved) sel.value = saved;
  sel.onchange = ()=> setS({voice: sel.value});
}
if('speechSynthesis' in window){
  window.speechSynthesis.onvoiceschanged = populateVoices;
  setTimeout(populateVoices, 200);
}

// ------- People (Connect demo) -------
function renderPeople(){
  const wrap = $('#people'); if(!wrap) return;
  wrap.innerHTML='';
  const s = S();
  const list = peopleDemo
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

// ------- Create (premium gate) -------
$('#btnGenerate').addEventListener('click', ()=>{
  $('#premiumGate').textContent = 'Premium krävs i demot — låst just nu.';
});

// ------- Panic -------
$('#panic').addEventListener('click', e=>{
  e.preventDefault(); try{ (window.speechSynthesis||{}).cancel?.(); }catch{}
  window.location.href='https://www.google.se';
});

// ------- Init -------
(function init(){
  const s = S();
  renderChips();
  setLevel(s.level||1);
  if(s.privacy){ $('#privacy').setAttribute('aria-pressed','true'); }
  render();
})();
