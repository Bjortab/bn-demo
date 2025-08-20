/* BN demo v0.3 — offline safe build */
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];

  // DOM refs
  const levelLabel = $('#levelLabel');
  const levelChips = $$('#levelChips .lvl');
  const tempo = $('#tempo'), tempoVal = $('#tempoVal');
  const voiceSel = $('#voice');
  const lenRadios = $$('input[name="len"]');
  const promptEl = $('#userPrompt');
  const out = $('#storyOutput');
  const audio = $('#audio');
  const recsEl = $('#recs');
  const favList = $('#favList');

  const btnPlay = $('#btnPlay');
  const btnGenerate = $('#btnGenerate');
  const btnPreview = $('#btnPreview');

  const tabs = $$('.bottom .tab');
  const mains = $$('main');

  const btnConnect = $('#btnConnect');
  const btnBack = $('#btnBack');
  const apiKeyIn = $('#apiKey');
  const keyStatus = $('#keyStatus');

  const modal = $('#modal');
  const mTitle = $('#mTitle');
  const mIngress = $('#mIngress');
  const mBody = $('#mBody');
  const mClose = $('#mClose');

  // State
  let state = {
    level: 1,
    tempo: 1.0,
    voice: 'auto',
    lengthMin: 1,
    story: '',
    favs: JSON.parse(localStorage.getItem('bn:favs')||'[]')
  };

  function saveFav(item){
    state.favs.unshift(item);
    state.favs = state.favs.slice(0,50);
    localStorage.setItem('bn:favs', JSON.stringify(state.favs));
    renderFavs();
  }

  function renderFavs(){
    if (!favList) return;
    favList.innerHTML = '';
    if (!state.favs.length){
      favList.innerHTML = `<div class="small">Inga sparade berättelser ännu.</div>`;
      return;
    }
    state.favs.forEach(f => {
      const el = document.createElement('div');
      el.className = 'rec';
      el.innerHTML = `
        <div class="title">${f.title}</div>
        <div class="ing small">${f.ingress||''}</div>
        <div class="row gap">
          <button class="btn" data-act="listen" data-id="${f.id}">Lyssna</button>
        </div>`;
      favList.appendChild(el);
    });
  }

  function fillVoices(){
    voiceSel.innerHTML = '';
    (window.DEMO_VOICES||[]).forEach(v=>{
      const opt = document.createElement('option');
      opt.value = v.id; opt.textContent = v.label;
      voiceSel.appendChild(opt);
    });
    voiceSel.value = state.voice;
  }

  function fillRecs(){
    recsEl.innerHTML = '';
    (window.DEMO_RECS||[]).forEach(r=>{
      const el = document.createElement('div');
      el.className = 'rec';
      el.innerHTML = `
        <div class="title">${r.title}</div>
        <div class="ing">${r.ing}</div>
        <div class="row gap">
          <button class="btn" data-act="save" data-id="${r.id}">Spara</button>
          <button class="btn" data-act="listen" data-id="${r.id}">Lyssna</button>
        </div>`;
      recsEl.appendChild(el);
    });
  }

  // ------- Navigation -------
  function show(targetId){
    mains.forEach(m => m.hidden = (m.id !== targetId));
    tabs.forEach(t => t.classList.toggle('active', t.dataset.target===targetId));
  }
  tabs.forEach(t => t.addEventListener('click', ()=> show(t.dataset.target)));
  btnConnect.addEventListener('click', ()=> show('connect'));
  btnBack.addEventListener('click', ()=> show('home'));

  // ------- Level / tempo -------
  levelChips.forEach(c => c.addEventListener('click', ()=>{
    levelChips.forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    state.level = Number(c.dataset.level);
    levelLabel.textContent = state.level;
  }));
  tempo.addEventListener('input', ()=>{
    state.tempo = Number(tempo.value);
    tempoVal.textContent = state.tempo.toFixed(2) + '×';
  });

  // ------- Voice & length -------
  fillVoices(); fillRecs(); renderFavs();
  voiceSel.addEventListener('change', ()=> state.voice = voiceSel.value);
  lenRadios.forEach(r => r.addEventListener('change', ()=> state.lengthMin = Number(document.querySelector('input[name="len"]:checked').value)));

  // ------- Demo story generator -------
  function demoStory(prompt, level, minutes){
    const tones = {1:'romantisk',2:'nyfiken',3:'sensuell',4:'intensiv',5:'ingående'};
    const tone = tones[level] || 'sensuell';
    return `(${minutes} min, nivå ${level} – ${tone})\n`+
      `Hon möter blicken, ett halvt steg närmare. ${prompt||'Du hade önskat en överraskning'} `+
      `blir till en mjuk öppning: långsamt tempo, värme i rösten, pauser som landar. `+
      `Berättelsen växlar mellan förväntan och närhet — tills rytmen hittar hem.`;
  }

  // ------- Real (when OFFLINE_MODE=false) -------
  async function aiStory(prompt, level, minutes){
    // Minimal real call – kan byggas ut senare
    const key = window.getApiKey();
    if (!key) throw new Error('Ingen API-nyckel satt');
    const res = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({
        model:'gpt-4o-mini',
        messages:[
          {role:'system',content:'Du är en sensuell berättarröst. Skriv på svenska.'},
          {role:'user',content:`Skriv en erotisk novell, nivå ${level}, ca ${minutes} minuter läsning. Prompt: ${prompt||'Överraska'}`}
        ],
        max_tokens: 600
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message||'API-fel');
    return data.choices?.[0]?.message?.content || '—';
  }

  // ------- TTS (offline demo via SpeechSynthesis) -------
  function speak(text){
    try{
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'sv-SE';
      u.rate = state.tempo;
      speechSynthesis.speak(u);
    }catch(e){
      alert('TTS ej tillgänglig i denna browser');
    }
  }

  // ------- Handlers -------
  btnGenerate.addEventListener('click', async ()=>{
    const prompt = promptEl.value.trim();
    out.textContent = 'Genererar...';
    btnGenerate.disabled = true;

    try{
      const txt = window.OFFLINE_MODE ? demoStory(prompt, state.level, state.lengthMin)
                                      : await aiStory(prompt, state.level, state.lengthMin);
      state.story = txt;
      out.textContent = txt;
    }catch(e){
      out.textContent = 'Fel: '+ e.message;
    }finally{
      btnGenerate.disabled = false;
    }
  });

  btnPreview.addEventListener('click', ()=>{
    if (!state.story){ out.textContent = 'Generera först.'; return; }
    mTitle.textContent = 'Förhandsvisning';
    mIngress.textContent = `Nivå ${state.level} • ${state.lengthMin} min • Tempo ${state.tempo.toFixed(2)}×`;
    mBody.textContent = state.story;
    modal.showModal();
  });
  $('#mClose').addEventListener('click', ()=> modal.close());

  btnPlay.addEventListener('click', ()=>{
    if (!state.story){ out.textContent = 'Generera först.'; return; }
    speak(state.story);
  });

  // ------- Rekommenderade klick -------
  recsEl.addEventListener('click', (e)=>{
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const id = b.dataset.id;
    const rec = (window.DEMO_RECS||[]).find(x=>x.id===id);
    if (!rec) return;

    if (b.dataset.act === 'save'){
      saveFav({ id:'fav-'+Date.now(), title:rec.title, ingress:rec.ing });
      b.textContent = 'Sparat ✓';
    } else if (b.dataset.act === 'listen'){
      // enkel demo-lyssning
      speak(`${rec.title}. ${rec.ing}`);
    }
  });

  // ------- Connect: API key -------
  (function initKeyUI(){
    apiKeyIn.value = window.getApiKey();
    keyStatus.textContent = apiKeyIn.value ? 'Nyckel är lagrad lokalt.' : 'Ingen nyckel sparad.';
    $('#btnSaveKey').addEventListener('click', ()=>{
      window.setApiKey(apiKeyIn.value.trim());
      keyStatus.textContent = 'Nyckel sparad lokalt.';
    });
    $('#btnClearKey').addEventListener('click', ()=>{
      window.clearApiKey();
      apiKeyIn.value = '';
      keyStatus.textContent = 'Nyckel rensad.';
    });
  })();

  // Startvy
  show('home');
})();
