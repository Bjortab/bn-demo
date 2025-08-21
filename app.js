/* BN demo v0.3 — offline safe build */
(()=> {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

  const levelLabel=$('#levelLabel'); const levelChips=$$('#levelChips .lvl');
  const tempo=$('#tempo'), tempoVal=$('#tempoVal');
  const voiceSel=$('#voice'); const lenRadios=$$('input[name="len"]');
  const promptEl=$('#userPrompt'); const out=$('#storyOutput'); const audio=$('#audio');
  const recsEl=$('#recs'); const favList=$('#favList');

  const btnPlay=$('#btnPlay'), btnGenerate=$('#btnGenerate'), btnPreview=$('#btnPreview');
  const tabs=$$('.bottom .tab'), mains=$$('main');
  const btnConnect=$('#btnConnect'), btnBack=$('#btnBack');
  const apiKeyIn=$('#apiKey'), keyStatus=$('#keyStatus');

  const modal=$('#modal'), mTitle=$('#mTitle'), mIngress=$('#mIngress'), mBody=$('#mBody');
  $('#mClose').addEventListener('click',()=>modal.close());

  let state={level:1, tempo:1.0, voice:'auto', lengthMin:1, story:'', favs:JSON.parse(localStorage.getItem('bn:favs')||'[]')};

  function show(id){ mains.forEach(m=>m.hidden=m.id!==id); tabs.forEach(t=>t.classList.toggle('active',t.dataset.target===id)); }
  tabs.forEach(t=>t.addEventListener('click',()=>show(t.dataset.target)));
  btnConnect.addEventListener('click',()=>show('connect')); btnBack.addEventListener('click',()=>show('home')); show('home');

  levelChips.forEach(c=>c.addEventListener('click',()=>{ levelChips.forEach(x=>x.classList.remove('active')); c.classList.add('active'); state.level=+c.dataset.level; levelLabel.textContent=state.level; }));
  tempo.addEventListener('input',()=>{ state.tempo=+tempo.value; tempoVal.textContent=state.tempo.toFixed(2)+'×'; });

  (window.DEMO_VOICES||[]).forEach(v=>{ const o=document.createElement('option'); o.value=v.id; o.textContent=v.label; voiceSel.appendChild(o); });
  voiceSel.addEventListener('change',()=>state.voice=voiceSel.value);
  lenRadios.forEach(r=>r.addEventListener('change',()=>state.lengthMin=+document.querySelector('input[name="len"]:checked').value));

  function renderFavs(){ favList.innerHTML=state.favs.length? '' : '<div class="small">Inga sparade berättelser ännu.</div>';
    state.favs.forEach(f=>{ const el=document.createElement('div'); el.className='rec'; el.innerHTML=`<div class="title">${f.title}</div><div class="ing small">${f.ingress||''}</div><div class="row gap"><button class="btn" data-act="listen" data-id="${f.id}">Lyssna</button></div>`; favList.appendChild(el);});}
  function saveFav(x){ state.favs.unshift(x); state.favs=state.favs.slice(0,50); localStorage.setItem('bn:favs',JSON.stringify(state.favs)); renderFavs(); }
  renderFavs();

  (window.DEMO_RECS||[]).forEach(r=>{ const el=document.createElement('div'); el.className='rec'; el.innerHTML=`<div class="title">${r.title}</div><div class="ing">${r.ing}</div><div class="row gap"><button class="btn" data-act="save" data-id="${r.id}">Spara</button><button class="btn" data-act="listen" data-id="${r.id}">Lyssna</button></div>`; recsEl.appendChild(el);});
  recsEl.addEventListener('click',e=>{ const b=e.target.closest('button[data-act]'); if(!b) return; const rec=(window.DEMO_RECS||[]).find(x=>x.id===b.dataset.id); if(!rec) return;
    if(b.dataset.act==='save'){ saveFav({id:'fav-'+Date.now(), title:rec.title, ingress:rec.ing}); b.textContent='Sparat ✓'; }
    else { speak(`${rec.title}. ${rec.ing}`); } });

  function demoStory(prompt, level, minutes){
    const tones={1:'romantisk',2:'nyfiken',3:'sensuell',4:'intensiv',5:'ingående'};
    const tone=tones[level]||'sensuell';
    return `(${minutes} min, nivå ${level} – ${tone})\n`+
      `Hon möter blicken, ett halvt steg närmare. ${prompt||'Du hade önskat en överraskning'} `+
      `blir till en mjuk öppning: långsamt tempo, värme i rösten, pauser som landar. `+
      `Berättelsen växlar mellan förväntan och närhet — tills rytmen hittar hem.`;
  }

  async function aiStory(prompt, level, minutes){
    const key=window.getApiKey(); if(!key) throw new Error('Ingen API-nyckel satt');
    const res=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({ model:'gpt-4o-mini',
        messages:[
          {role:'system',content:'Du är en sensuell berättarröst. Skriv på svenska.'},
          {role:'user',content:`Skriv en erotisk novell, nivå ${level}, ca ${minutes} minuter. Prompt: ${prompt||'Överraska'}`}
        ],
        max_tokens:600
      })
    });
    const data=await res.json(); if(!res.ok) throw new Error(data?.error?.message||'API-fel');
    return data.choices?.[0]?.message?.content||'—';
  }

  function speak(text){
    try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='sv-SE'; u.rate=state.tempo; speechSynthesis.speak(u);}
    catch{ alert('TTS ej tillgänglig i denna browser'); }
  }

  $('#btnGenerate').addEventListener('click', async ()=>{
    const prompt=promptEl.value.trim(); out.textContent='Genererar...'; btnGenerate.disabled=true;
    try{ state.story = window.OFFLINE_MODE ? demoStory(prompt,state.level,state.lengthMin) : await aiStory(prompt,state.level,state.lengthMin);
         out.textContent=state.story; }
    catch(e){ out.textContent='Fel: '+e.message; }
    finally{ btnGenerate.disabled=false; }
  });

  $('#btnPreview').addEventListener('click', ()=>{
    if(!state.story){ out.textContent='Generera först.'; return; }
    mTitle.textContent='Förhandsvisning';
    mIngress.textContent=`Nivå ${state.level} • ${state.lengthMin} min • Tempo ${state.tempo.toFixed(2)}×`;
    mBody.textContent=state.story; modal.showModal();
  });

  $('#btnPlay').addEventListener('click', ()=>{ if(!state.story){ out.textContent='Generera först.'; return; } speak(state.story); });

  (function initKeyUI(){
    apiKeyIn.value=window.getApiKey();
    keyStatus.textContent=apiKeyIn.value?'Nyckel är lagrad lokalt.':'Ingen nyckel sparad.';
    $('#btnSaveKey').addEventListener('click',()=>{ window.setApiKey(apiKeyIn.value.trim()); keyStatus.textContent='Nyckel sparad lokalt.';});
    $('#btnClearKey').addEventListener('click',()=>{ window.clearApiKey(); apiKeyIn.value=''; keyStatus.textContent='Nyckel rensad.';});
  })();
})();
