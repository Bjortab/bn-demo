(() => {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const LS = {
    get k(){ return localStorage.getItem('OPENAI_API_KEY') || ""; },
    set k(v){ localStorage.setItem('OPENAI_API_KEY', v || ""); },
    get level(){ return +(localStorage.getItem('BN_level')||'1'); },
    set level(v){ localStorage.setItem('BN_level', v); },
    get minutes(){ return +(localStorage.getItem('BN_minutes')||'3'); },
    set minutes(v){ localStorage.setItem('BN_minutes', v); },
    get voice(){ return localStorage.getItem('BN_voice') || (window.BN_DEFAULTS?.voice || 'alloy'); },
    set voice(v){ localStorage.setItem('BN_voice', v); },
    get tempo(){ return +(localStorage.getItem('BN_tempo')||'1'); },
    set tempo(v){ localStorage.setItem('BN_tempo', v); },
  };

  const OPENAI_BASE = 'https://api.openai.com/v1';
  const TEXT_MODEL = window.BN_DEFAULTS?.textModel || 'gpt-4o-mini';
  const TTS_MODEL  = window.BN_DEFAULTS?.ttsModel  || 'gpt-4o-mini-tts';

  // tabbar
  $$('.tab').forEach(btn=>{
    btn.addEventListener('click', () => {
      $$('.tab').forEach(b=>b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const id = btn.dataset.tab;
      $$('.view').forEach(v=>v.classList.remove('is-active'));
      $('#'+id).classList.add('is-active');
    });
  });

  // init kontroller
  // nivå
  const levelChips = $('#levelChips');
  levelChips.addEventListener('click', (e)=>{
    const b = e.target.closest('.chip'); if(!b) return;
    levelChips.querySelectorAll('.chip').forEach(x=>x.classList.remove('is-active'));
    b.classList.add('is-active');
    LS.level = +b.dataset.l;
  });
  // längd
  const lenChips = $('#lenChips');
  lenChips.addEventListener('click', (e)=>{
    const b = e.target.closest('.chip'); if(!b) return;
    lenChips.querySelectorAll('.chip').forEach(x=>x.classList.remove('is-active'));
    b.classList.add('is-active');
    LS.minutes = +b.dataset.m;
  });
  // voice
  const voiceSel = $('#voice'); voiceSel.value = LS.voice;
  voiceSel.addEventListener('change', ()=> LS.voice = voiceSel.value);
  // tempo
  const tempo = $('#tempo'), tempoVal = $('#tempoVal');
  tempo.value = String(LS.tempo || 1); tempoVal.textContent = (+tempo.value).toFixed(2)+'×';
  tempo.addEventListener('input', ()=>{ LS.tempo = +tempo.value; tempoVal.textContent = (+tempo.value).toFixed(2)+'×'; });

  // återställ tidigare val i UI
  (function hydrate(){
    // nivå
    const l = LS.level;
    levelChips.querySelectorAll('.chip').forEach(x=>x.classList.toggle('is-active', +x.dataset.l===l));
    // längd
    const m = LS.minutes || 1;
    lenChips.querySelectorAll('.chip').forEach(x=>x.classList.toggle('is-active', +x.dataset.m===m));
  })();

  // status
  function setStatus(msg, tone='muted'){ const el=$('#status'); el.className=tone; el.textContent=msg; }

  // API-nyckel dialog
  const dlg = $('#dlgKey'), keyInput = $('#keyInput'), keyStatus = $('#keyStatus');
  function refreshKeyUI(){
    keyInput.value = LS.k || (window.OPENAI_API_KEY||"");
    keyStatus.textContent = (LS.k||window.OPENAI_API_KEY) ? 'Nyckel lagrad lokalt.' : 'Ingen nyckel lagrad.';
  }
  $('#btnKey').addEventListener('click', ()=>{ refreshKeyUI(); dlg.showModal(); });
  $('#btnOpenKeyFromConnect').addEventListener('click', ()=>{ refreshKeyUI(); dlg.showModal(); });
  $('#btnKeySave').addEventListener('click', (e)=>{ e.preventDefault(); const v=keyInput.value.trim(); if(!/^sk-/.test(v)){ keyStatus.textContent='Ogiltig nyckel (måste börja med sk-)'; return; } LS.k=v; keyStatus.textContent='Sparad.'; });
  $('#btnKeyClear').addEventListener('click', (e)=>{ e.preventDefault(); LS.k=""; keyInput.value=""; keyStatus.textContent='Rensad.'; });

  // Textgenerering
  async function genText(prompt){
    const apiKey = (LS.k || window.OPENAI_API_KEY || "").trim();
    if(!/^sk-/.test(apiKey)) throw new Error('Ingen giltig API-nyckel. Öppna “API-nyckel” och spara din sk-nyckel.');

    const level = LS.level || 1;
    const minutes = LS.minutes || 1;

    const sys = 'Du är en svensk sensuell berättarröst. Anpassa explicitnivå tydligt: 1 oskyldig, 3 mellan, 5 ingående. Ton: varm, naturlig.';
    const user = `Skriv en erotisk berättelse på svenska.
Nivå: ${level}
Längd: ca ${minutes} min uppläsning.
Prompt: ${prompt || 'Överraska mig med värme och närhet.'}`;

    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages: [{role:'system', content:sys},{role:'user', content:user}],
        temperature: 0.95,
        max_tokens: 1100
      })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data?.error?.message || 'API-fel (text)');
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  // TTS
  async function playTTS(text){
    const apiKey = (LS.k || window.OPENAI_API_KEY || "").trim();
    if(!/^sk-/.test(apiKey)) throw new Error('Ingen giltig API-nyckel.');

    const voice = LS.voice || 'alloy';
    const res = await fetch(`${OPENAI_BASE}/audio/speech`, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body: JSON.stringify({ model: TTS_MODEL, voice, input: text, format:'mp3' })
    });
    if(!res.ok){
      let msg='API-fel (TTS)';
      try{ const j=await res.json(); msg=j?.error?.message||msg; }catch{}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = $('#audio');
    a.src = url; a.playbackRate = Math.max(.5, Math.min(2, LS.tempo||1));
    await a.play();
  }

  // Händelser
  let currentStory = '';
  $('#btnGen').addEventListener('click', async ()=>{
    const p = $('#prompt').value.trim();
    setStatus('Genererar…');
    $('#story').textContent = '— genererar… —';
    try{
      currentStory = await genText(p);
      $('#story').textContent = currentStory || '(tomt svar)';
      setStatus('Klar', 'ok');
    }catch(e){
      $('#story').textContent = 'Fel: '+e.message;
      setStatus('Fel: '+e.message, 'err');
    }
  });

  $('#btnPlay').addEventListener('click', async ()=>{
    if(!currentStory){ setStatus('Generera först.'); return; }
    setStatus('Spelar upp…');
    try{
      await playTTS(currentStory);
      setStatus('Uppspelning');
    }catch(e){
      setStatus('Fel: '+e.message, 'err');
    }
  });

  // Smakprovskort
  document.addEventListener('click', async (e)=>{
    const b = e.target.closest('[data-sample]');
    if(!b) return;
    const kind = b.dataset.sample;
    const samples = {
      nearhet: 'Ta min hand. Stanna upp, låt blicken vila, och andas tillsammans. Rösten är låg, varm och mjuk.',
      stress: 'När det rusar i kroppen: sakta ner, känn fötterna mot golvet. Låt orden landa som mjuka vågor.',
      sensuell: 'Rytmen är långsam. Varje ord placerat med omsorg. Värmen stiger, ett steg närmare.'
    };
    const text = samples[kind] || 'Mjuk förhandsvisning.';
    try{
      await playTTS(text);
      setStatus('Spelar smakprov');
    }catch(err){
      setStatus('Fel: '+err.message, 'err');
    }
  });

  // Rescue-knapp – öppnar mini-panel (inget Console-trix längre)
  $('#btnRescue').addEventListener('click', ()=>{
    if(window.__BN_RESCUE__) return alert('Rescue är redan öppet.');
    // Liten inline-variant: ladda samma panel som i tidigare patch (lite kortare)
    (function(){
      window.__BN_RESCUE__=true;
      const box=document.createElement('div');
      box.style.cssText='position:fixed;right:16px;bottom:16px;z-index:999999;background:#111;border:1px solid #333;border-radius:10px;padding:10px;color:#eee;width:min(420px,92vw)';
      box.innerHTML = `
        <div style="font-weight:700;background:linear-gradient(90deg,#ff4bb5,#7a5cff);padding:8px;border-radius:8px;color:#fff">BN Rescue</div>
        <div style="margin-top:8px;display:flex;gap:6px"><input id="rKey" placeholder="sk-..." style="flex:1;background:#0b0d10;border:1px solid #2a2a2a;border-radius:8px;padding:6px;color:#eee"/><button id="rSave">Spara</button></div>
        <div style="margin-top:8px"><textarea id="rPrompt" placeholder="Skriv din idé…" style="width:100%;min-height:90px;background:#0b0d10;border:1px solid #2a2a2a;border-radius:8px;padding:6px;color:#eee"></textarea></div>
        <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
          <label>Nivå <select id="rL"><option>1</option><option>3</option><option selected>5</option></select></label>
          <label>Längd <select id="rM"><option>1</option><option selected>3</option><option>5</option></select></label>
          <label>Röst <select id="rV"><option>alloy</option><option>aria</option><option>coral</option><option>verse</option></select></label>
          <label>Tempo <input id="rT" type="range" min="0.7" max="1.6" step="0.05" value="1.0"/></label>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px"><button id="rGen">Generera</button><button id="rPlay">Lyssna</button><button id="rClose">Stäng</button></div>
        <pre id="rOut" style="margin-top:8px;white-space:pre-wrap;color:#a8acb6">— ingen berättelse än —</pre>`;
      document.body.appendChild(box);
      const rK=box.querySelector('#rKey'), rS=box.querySelector('#rSave'), rP=box.querySelector('#rPrompt');
      const rL=box.querySelector('#rL'), rM=box.querySelector('#rM'), rV=box.querySelector('#rV'), rT=box.querySelector('#rT');
      const rG=box.querySelector('#rGen'), rPlay=box.querySelector('#rPlay'), rClose=box.querySelector('#rClose'), rOut=box.querySelector('#rOut');
      rK.value = LS.k || '';
      rS.onclick = ()=>{ LS.k=rK.value.trim(); rOut.textContent='Nyckel sparad.'; };
      let rescueStory='';
      rG.onclick = async ()=>{
        try{
          LS.level=+rL.value; LS.minutes=+rM.value; LS.voice=rV.value; LS.tempo=+rT.value;
          rescueStory = await genText(rP.value.trim()); rOut.textContent=rescueStory||'(tomt)';
        }catch(e){ rOut.textContent='Fel: '+e.message; }
      };
      rPlay.onclick = async ()=>{ if(!rescueStory){rOut.textContent='Generera först.';return;} try{ await playTTS(rescueStory); }catch(e){ rOut.textContent='Fel: '+e.message; } };
      rClose.onclick = ()=>{ box.remove(); delete window.__BN_RESCUE__; };
    })();
  });

  console.log('%cBN v0.4 online','background:#222;color:#0f0;padding:2px 6px');
})();
