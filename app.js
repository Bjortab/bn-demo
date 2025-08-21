/* BN v0.4 — Online med OpenAI TTS + text (fallback tydlig) */
(() => {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

  // refs
  const tempo=$('#tempo'), tempoVal=$('#tempoVal'), btnPlay=$('#btnPlay');
  const levelChips=$$('#levelChips .lvl'), voiceSel=$('#voice'), lenRadios=$$('input[name="len"]');
  const promptEl=$('#userPrompt'), out=$('#storyOutput'), audio=$('#audio');
  const recsEl=$('#recs'), favList=$('#favList');
  const tabs=$$('.bottom .tab'), mains=$$('main'), btnConnect=$('#btnConnect'), btnBack=$('#btnBack');
  const apiKeyIn=$('#apiKey'), keyStatus=$('#keyStatus');
  const modal=$('#modal'), mTitle=$('#mTitle'), mIngress=$('#mIngress'), mBody=$('#mBody'); $('#mClose').addEventListener('click',()=>modal.close());

  // state
  let state={level:1, tempo:1.0, voice:'alloy', lengthMin:1, story:'', favs:JSON.parse(localStorage.getItem('bn:favs')||'[]')};

  // nav
  function show(id){ mains.forEach(m=>m.hidden=m.id!==id); tabs.forEach(t=>t.classList.toggle('active',t.dataset.target===id)); }
  tabs.forEach(t=>t.addEventListener('click',()=>show(t.dataset.target)));
  btnConnect.addEventListener('click',()=>show('connect')); btnBack.addEventListener('click',()=>show('home')); show('home');

  // nivåer
  levelChips.forEach(c=>c.addEventListener('click',()=>{ levelChips.forEach(x=>x.classList.remove('active')); c.classList.add('active'); state.level=+c.dataset.level; }));

  // tempo
  tempo.addEventListener('input',()=>{ state.tempo=+tempo.value; tempoVal.textContent=state.tempo.toFixed(2)+'×'; });

  // röster (mappas till OpenAI voice)
  function initVoices(){
    voiceSel.innerHTML='';
    (window.DEMO_VOICES||[]).forEach(v=>{ const o=document.createElement('option'); o.value=v.id; o.textContent=v.label; voiceSel.appendChild(o); });
    state.voice = voiceSel.value || 'alloy';
  }
  initVoices();
  voiceSel.addEventListener('change',()=>state.voice=voiceSel.value);

  // längd
  lenRadios.forEach(r=>r.addEventListener('change',()=>state.lengthMin=+document.querySelector('input[name="len"]:checked').value));

  // demo-text (fallback om OFFLINE_MODE=true)
  function demoStory(prompt, level, minutes){
    const tones={1:'romantisk',2:'nyfiken',3:'sensuell',4:'intensiv',5:'ingående'};
    const tone=tones[level]||'sensuell';
    return `(${minutes} min • nivå ${level} • ${tone})\n`+
      `Hon möter blicken — ett halvt steg närmare. ${prompt||'Överraskningen du önskade'} blir till en mjuk öppning.\n`+
      `Tempot är långsamt, rösten varm. Pauserna får plats.\n`+
      `Berättelsen pendlar mellan förväntan och närhet tills rytmen hittar hem.`;
  }

  // ==== OPENAI HELPERS ====
  const OPENAI_BASE = 'https://api.openai.com/v1';

  function ensureKey(){
    const key = (window.getApiKey && window.getApiKey()) || window.OPENAI_API_KEY || '';
    if (!key || !key.startsWith('sk-')) throw new Error('Ingen giltig API-nyckel hittad. Öppna BlushConnect och spara nyckeln lokalt.');
    return key;
  }

  async function aiStory(prompt, level, minutes){
    const key = ensureKey();
    const res = await fetch(`${OPENAI_BASE}/chat/completions`,{
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+key },
      body:JSON.stringify({
        model:'gpt-4o-mini',
        messages:[
          {role:'system',content:'Du är en svensk sensuell berättarröst. Skriv på svenska. Anpassa explicit-nivå till användarens nivå (1–5).'},
          {role:'user',content:`Skriv en erotisk novell på svenska. Nivå ${level}. Längd ca ${minutes} minuter uppläsning. Prompt: ${prompt || 'Överraska mig'}.`}
        ],
        max_tokens: 900,
        temperature: 0.9
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || 'API-fel (text)');
    return data.choices?.[0]?.message?.content?.trim() || '—';
  }

  async function ttsPlay(text, voiceId, rate){
    const key = ensureKey();
    // OpenAI TTS: gpt-4o-mini-tts → mp3
    const res = await fetch(`${OPENAI_BASE}/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + key },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: voiceId || 'alloy',
        input: text,
        format: 'mp3'
      })
    });
    if (!res.ok) {
      let msg = 'API-fel (TTS)';
      try { const j = await res.json(); msg = j?.error?.message || msg; } catch{}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    audio.src = url;
    audio.playbackRate = Math.max(0.5, Math.min(2, rate||1));
    await audio.play();
  }

  // ====== UI handlers ======
  $('#btnGenerate').addEventListener('click', async ()=>{
    const tag = (Array.from(document.querySelectorAll('.chip.tag.active')).map(b=>b.dataset.tag)[0]) || '';
    const prompt = [promptEl.value.trim(), tag].filter(Boolean).join(', ');

    out.textContent = window.OFFLINE_MODE ? 'Genererar (offline)...' : 'Genererar via OpenAI...';
    $('#btnGenerate').disabled = true;

    try{
      state.story = window.OFFLINE_MODE ? demoStory(prompt, state.level, state.lengthMin)
                                        : await aiStory(prompt, state.level, state.lengthMin);
      out.textContent = state.story;
    }catch(e){
      out.textContent = 'Fel: ' + e.message;
    }finally{
      $('#btnGenerate').disabled = false;
    }
  });

  $('#btnPreview').addEventListener('click', ()=>{
    if(!state.story){ out.textContent='Generera först.'; return; }
    mTitle.textContent='Förhandsvisning';
    mIngress.textContent=`Nivå ${state.level} • ${state.lengthMin} min • Tempo ${state.tempo.toFixed(2)}× • Röst ${state.voice}`;
    mBody.textContent=state.story;
    modal.showModal();
  });

  btnPlay.addEventListener('click', async ()=>{
    if(!state.story){ out.textContent='Generera först.'; return; }
    try{
      if (window.OFFLINE_MODE) {
        // Fallback: web speech (robotröst)
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(state.story);
        u.lang = 'sv-SE'; u.rate = state.tempo;
        speechSynthesis.speak(u);
      } else {
        await ttsPlay(state.story, state.voice, state.tempo);
      }
    }catch(e){
      out.textContent = 'Fel (uppspelning): ' + e.message;
    }
  });

  // Rekommenderat + sparat (oförändrat)
  function renderFavs(){
    favList.innerHTML = state.favs.length? '' : '<div class="rec">Inga sparade berättelser ännu.</div>';
    state.favs.forEach(f=>{
      const el=document.createElement('div'); el.className='rec';
      el.innerHTML=`<div class="title">${f.title}</div><div class="ing">${f.ing||''}</div>
        <div class="row gap"><button class="btn" data-act="listen" data-id="${f.id}">Lyssna</button></div>`;
      favList.appendChild(el);
    });
  }
  function saveFav(x){ state.favs.unshift(x); state.favs=state.favs.slice(0,50); localStorage.setItem('bn:favs',JSON.stringify(state.favs)); renderFavs(); }
  renderFavs();

  (window.DEMO_RECS||[]).forEach(r=>{
    const el=document.createElement('div'); el.className='rec';
    el.innerHTML=`<div class="title">${r.title}</div><div class="ing">${r.ing}</div>
      <div class="row gap"><button class="btn" data-act="save" data-id="${r.id}">Spara</button>
      <button class="btn" data-act="listen" data-id="${r.id}">Lyssna</button></div>`;
    recsEl.appendChild(el);
  });
  recsEl.addEventListener('click',async e=>{
    const b=e.target.closest('button[data-act]'); if(!b) return;
    const rec=(window.DEMO_RECS||[]).find(x=>x.id===b.dataset.id); if(!rec) return;
    if(b.dataset.act==='save'){ saveFav({id:'fav-'+Date.now(), title:rec.title, ing:rec.ing}); b.textContent='Sparat ✓'; }
    else {
      try{
        if (window.OFFLINE_MODE) {
          speechSynthesis.cancel();
          const u=new SpeechSynthesisUtterance(`${rec.title}. ${rec.ing}`); u.lang='sv-SE'; u.rate=state.tempo; speechSynthesis.speak(u);
        } else {
          await ttsPlay(`${rec.title}. ${rec.ing}`, state.voice, state.tempo);
        }
      } catch(e){ out.textContent='Fel (rek-lyssna): '+e.message; }
    }
  });

  // Connect: API-key lokal
  (function initKeyUI(){
    apiKeyIn.value = (window.getApiKey && window.getApiKey()) || window.OPENAI_API_KEY || '';
    keyStatus.textContent = apiKeyIn.value ? 'Nyckel är lagrad lokalt.' : 'Ingen nyckel sparad.';
    $('#btnSaveKey').addEventListener('click',()=>{ window.setApiKey(apiKeyIn.value.trim()); keyStatus.textContent='Nyckel sparad lokalt.'; });
    $('#btnClearKey').addEventListener('click',()=>{ window.clearApiKey(); apiKeyIn.value=''; keyStatus.textContent='Nyckel rensad.'; });
  })();
})();
