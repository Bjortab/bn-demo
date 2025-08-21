/* BN v0.3 — återställd, nivåer 1–5, offline-säker */
(()=> {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

  // refs
  const tempo=$('#tempo'), tempoVal=$('#tempoVal'), btnPlay=$('#btnPlay');
  const levelChips=$$('#levelChips .lvl'), voiceSel=$('#voice'), lenRadios=$$('input[name="len"]');
  const promptEl=$('#userPrompt'), out=$('#storyOutput'), audio=$('#audio');
  const recsEl=$('#recs'), favList=$('#favList');
  const tabs=$$('.bottom .tab'), mains=$$('main'), btnConnect=$('#btnConnect'), btnBack=$('#btnBack');
  const apiKeyIn=$('#apiKey'), keyStatus=$('#keyStatus');
  const modal=$('#modal'), mTitle=$('#mTitle'), mIngress=$('#mIngress'), mBody=$('#mBody');
  $('#mClose').addEventListener('click',()=>modal.close());

  // state
  let state={level:1, tempo:1.0, voice:'auto', lengthMin:1, story:'', favs:JSON.parse(localStorage.getItem('bn:favs')||'[]')};

  // nav
  function show(id){ mains.forEach(m=>m.hidden=m.id!==id); tabs.forEach(t=>t.classList.toggle('active',t.dataset.target===id)); }
  tabs.forEach(t=>t.addEventListener('click',()=>show(t.dataset.target)));
  btnConnect.addEventListener('click',()=>show('connect')); btnBack.addEventListener('click',()=>show('home')); show('home');

  // nivåer
  levelChips.forEach(c=>c.addEventListener('click',()=>{ levelChips.forEach(x=>x.classList.remove('active')); c.classList.add('active'); state.level=+c.dataset.level; }));

  // tempo
  tempo.addEventListener('input',()=>{ state.tempo=+tempo.value; tempoVal.textContent=state.tempo.toFixed(2)+'×'; });

  // röster
  function initVoices() {
    voiceSel.innerHTML='';
    (window.DEMO_VOICES||[]).forEach(v=>{ const o=document.createElement('option'); o.value=v.id; o.textContent=v.label; voiceSel.appendChild(o); });
    voiceSel.value=state.voice;
  }
  initVoices();
  voiceSel.addEventListener('change',()=>state.voice=voiceSel.value);

  // längd
  lenRadios.forEach(r=>r.addEventListener('change',()=>state.lengthMin=+document.querySelector('input[name="len"]:checked').value));

  // demo-story
  function demoStory(prompt, level, minutes){
    const tones={1:'romantisk',2:'nyfiken',3:'sensuell',4:'intensiv',5:'ingående'};
    const tone=tones[level]||'sensuell';
    const body = [
      `(${minutes} min • nivå ${level} • ${tone})`,
      `Hon möter blicken — ett halvt steg närmare. ${prompt||'Överraskningen du önskade'} blir till en mjuk öppning.`,
      `Tempot är långsamt, rösten varm. Pauserna får plats.`,
      `Berättelsen pendlar mellan förväntan och närhet tills rytmen hittar hem.`
    ].join('\n');
    return body;
  }

  // speak (web speech API för demo)
  function speak(text){
    try{
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang='sv-SE'; u.rate=state.tempo;
      speechSynthesis.speak(u);
    }catch{ alert('Text-till-tal ej tillgängligt i denna webbläsare.'); }
  }

  // generera (offline)
  $('#btnGenerate').addEventListener('click', async ()=>{
    const tag = (Array.from(document.querySelectorAll('.chip.tag.active')).map(b=>b.dataset.tag)[0]) || '';
    const prompt = [promptEl.value.trim(), tag].filter(Boolean).join(', ');
    out.textContent='Genererar...'; $('#btnGenerate').disabled=true;
    try{
      state.story = demoStory(prompt, state.level, state.lengthMin);
      out.textContent = state.story;
    }catch(e){ out.textContent = 'Fel: '+e.message; }
    finally{ $('#btnGenerate').disabled=false; }
  });

  // tag toggles
  $$('#genCard .chip.tag').forEach(b=>b.addEventListener('click',()=>b.classList.toggle('active')));

  // preview
  $('#btnPreview').addEventListener('click', ()=>{
    if(!state.story){ out.textContent='Generera först.'; return; }
    mTitle.textContent='Förhandsvisning';
    mIngress.textContent=`Nivå ${state.level} • ${state.lengthMin} min • Tempo ${state.tempo.toFixed(2)}×`;
    mBody.textContent=state.story;
    modal.showModal();
  });

  // röstprov
  btnPlay.addEventListener('click', ()=>{
    const sample = demoStory('Ett kort röstprov för att känna tonen.', state.level, 1);
    speak(sample);
  });

  // rek + sparat
  function renderFavs(){
    favList.innerHTML = state.favs.length? '' : '<div class="rec">Inga sparade berättelser ännu.</div>';
    state.favs.forEach(f=>{
      const el=document.createElement('div'); el.className='rec';
      el.innerHTML=`<div class="title">${f.title}</div><div class="ing">${f.ing||''}</div><div class="row gap"><button class="btn" data-act="listen" data-id="${f.id}">Lyssna</button></div>`;
      favList.appendChild(el);
    });
  }
  function saveFav(x){ state.favs.unshift(x); state.favs=state.favs.slice(0,50); localStorage.setItem('bn:favs',JSON.stringify(state.favs)); renderFavs(); }
  renderFavs();

  (window.DEMO_RECS||[]).forEach(r=>{
    const el=document.createElement('div'); el.className='rec';
    el.innerHTML=`<div class="title">${r.title}</div><div class="ing">${r.ing}</div><div class="row gap"><button class="btn" data-act="save" data-id="${r.id}">Spara</button><button class="btn" data-act="listen" data-id="${r.id}">Lyssna</button></div>`;
    recsEl.appendChild(el);
  });
  recsEl.addEventListener('click',e=>{
    const b=e.target.closest('button[data-act]'); if(!b) return;
    const rec=(window.DEMO_RECS||[]).find(x=>x.id===b.dataset.id); if(!rec) return;
    if(b.dataset.act==='save'){ saveFav({id:'fav-'+Date.now(), title:rec.title, ing:rec.ing}); b.textContent='Sparat ✓'; }
    else { speak(`${rec.title}. ${rec.ing}`); }
  });

  // Connect: API-key lokal
  (function initKeyUI(){
    apiKeyIn.value=window.getApiKey();
    keyStatus.textContent = apiKeyIn.value ? 'Nyckel är lagrad lokalt.' : 'Ingen nyckel sparad.';
    $('#btnSaveKey').addEventListener('click',()=>{ window.setApiKey(apiKeyIn.value.trim()); keyStatus.textContent='Nyckel sparad lokalt.'; });
    $('#btnClearKey').addEventListener('click',()=>{ window.clearApiKey(); apiKeyIn.value=''; keyStatus.textContent='Nyckel rensad.'; });
  })();
})();
