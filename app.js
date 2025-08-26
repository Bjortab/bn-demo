(() => {
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

  const state = {
    level: window.DEFAULT_LEVEL || 1,
    minutes: 1,
    voice: null,
    rate: 1.0,
    story: '',
    apiKey: null
  };

  /* Tabs */
  $$('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const id = btn.dataset.tab;
      $$('.view').forEach(v=>v.classList.remove('active'));
      $('#'+id).classList.add('active');
    });
  });

  /* Nivåer */
  const levelChips = $('#levelChips');
  levelChips.addEventListener('click', (e)=>{
    const b = e.target.closest('.chip'); if(!b) return;
    $$('#levelChips .chip').forEach(x=>x.classList.remove('selected'));
    b.classList.add('selected');
    state.level = +b.dataset.level;
  });

  /* Längd */
  $('#lenChips').addEventListener('click', (e)=>{
    const b = e.target.closest('.chip'); if(!b) return;
    $$('#lenChips .chip').forEach(x=>x.classList.remove('selected'));
    b.classList.add('selected');
    state.minutes = +b.dataset.min;
  });

  /* Tempo & röster */
  const rate = $('#rate'), rateVal = $('#rateVal');
  rate.addEventListener('input', ()=>{ state.rate = +rate.value; rateVal.textContent = state.rate.toFixed(2)+'×'; });

  const voiceSel = $('#voiceSel');
  function populateVoices(){
    const voices = speechSynthesis.getVoices();
    voiceSel.innerHTML = '';
    const preferred = voices.filter(v=>/sv|swedish/i.test(v.lang));
    const list = preferred.length ? preferred : voices;
    list.forEach(v=>{
      const opt = document.createElement('option');
      opt.value = v.name; opt.textContent = `${v.name} (${v.lang})`;
      voiceSel.appendChild(opt);
    });
    state.voice = voiceSel.value;
  }
  speechSynthesis.onvoiceschanged = populateVoices;
  populateVoices();
  voiceSel.addEventListener('change', ()=>state.voice = voiceSel.value);

  /* API-nyckel lokalt (för TTS i framtiden / dev-verktyg) */
  $('#btnApiKey').addEventListener('click', ()=>{
    const key = prompt('Klistra in din OPENAI_API_KEY (sparas lokalt i denna webbläsare):', localStorage.getItem('OPENAI_API_KEY')||'');
    if(key){ localStorage.setItem('OPENAI_API_KEY', key.trim()); alert('Sparad i localStorage.'); }
  });

  /* Rescue-panel (liten status) */
  $('#btnRescue').addEventListener('click', ()=>{
    alert('BN Rescue: UI lever. Prova generera igen om något låst sig.');
  });

  /* Kort (lexicon.json) */
  async function loadCards(){
    try{
      const res = await fetch('lexicon.json');
      const data = await res.json();
      const wrap = $('#cards'); wrap.innerHTML = '';
      data.slice(0, window.BLUSH_NUM_CARDS||8).forEach(card=>{
        const el = document.createElement('div'); el.className = 'card';
        el.innerHTML = `
          <h3>${card.title}</h3>
          <p class="muted">${(card.desc||'').slice(0,140)}</p>
          <div class="row">
            <button class="btn" data-act="save" data-id="${card.id}">Spara</button>
            <button class="btn" data-act="listen" data-id="${card.id}">Lyssna</button>
          </div>`;
        wrap.appendChild(el);
      });
    }catch(err){ console.warn('lexicon load fail', err); }
  }
  loadCards();

  /* ===== Prompt builder – här bakar vi in dina fraser ===== */
  function buildPrompt(idea){
    const v = window.BLUSH_VOCAB || {L5_STRONG:[],L4_SOFT:[],BLOCKED:[]};

    let styleHint = '';
    if(state.level === 5){
      styleHint = `Högsta explicit-nivå. Föredra uttryck: ${v.L5_STRONG.join(', ')}. `;
    }else if(state.level === 4){
      styleHint = `Sensuell nivå. Håll det tydligt erotiskt men mildare. Förslag: ${v.L4_SOFT.join(', ')}. `;
    }else{
      styleHint = `Diskret nivå. Undvik könsord och rå explicithet. `;
    }
    if(v.BLOCKED.length){
      styleHint += `FÅR INTE förekomma: ${v.BLOCKED.join(', ')}. `;
    }

    const sys = [
      `Du skriver en svensk erotisk novell i jag-form med naturligt språk.`,
      `Följ längden ca ${state.minutes} minuter uppläst tid (ungefär ${state.minutes*1400} tecken).`,
      `Variera tempo, andning och pauser i texten.`,
      styleHint
    ].join(' ');

    const usr = idea && idea.trim()
      ? `Utgå från idén: ${idea.trim()}`
      : `Skapa en fristående kort berättelse med intim ton.`;

    return { system: sys, user: usr };
  }

  /* ===== Generering via Cloudflare Functions (/api/generate) ===== */
  async function generateStory(){
    const idea = $('#idea').value;
    const {system,user} = buildPrompt(idea);

    $('#status').textContent = 'Genererar...';
    $('#story').textContent = '';
    try{
      const res = await fetch('/api/generate', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          system, user,
          level: state.level,
          minutes: state.minutes
        })
      });

      if(!res.ok){
        const t = await res.text();
        throw new Error(`API fel: ${t}`);
      }
      const data = await res.json();
      const text = (data.text||'').trim();
      if(!text) throw new Error('Tomt svar från API.');

      state.story = text;
      $('#story').textContent = text;
      $('#status').textContent = 'Klart.';
    }catch(err){
      console.warn(err);
      if(window.DEMO_ALLOW_FALLBACK){
        const demo = demoText();
        state.story = demo;
        $('#story').textContent = demo;
        $('#status').textContent = 'Fallback (demo-text).';
      }else{
        $('#status').textContent = 'Misslyckades. Se konsolen.';
      }
    }
  }

  /* Enkel demo-text om API saknas */
  function demoText(){
    const base = state.level>=4
      ? 'Hennes andning blev tyngre medan närheten tätades mellan er.'
      : 'Ni drar er närmare, mjuka rörelser och en varm blick som stannar.';
    return `${base} (demo – ersätts av riktig text när API är aktivt)`;
  }

  /* ===== Uppläsning (Web Speech) ===== */
  function speak(text){
    try{ speechSynthesis.cancel(); }catch{}
    const u = new SpeechSynthesisUtterance(text);
    u.rate = state.rate;
    const v = speechSynthesis.getVoices().find(x=>x.name===state.voice) ||
              speechSynthesis.getVoices().find(x=>/sv|swedish/i.test(x.lang)) ||
              speechSynthesis.getVoices()[0];
    if(v) u.voice = v;
    speechSynthesis.speak(u);
  }

  /* Events */
  $('#btnGenerate').addEventListener('click', generateStory);
  $('#btnListen').addEventListener('click', ()=>{ if(state.story) speak(state.story); });
  $('#btnStop').addEventListener('click', ()=>speechSynthesis.cancel());

  /* Snabbinit */
  $('#status').textContent = 'BN v0.5 laddad';
})();
