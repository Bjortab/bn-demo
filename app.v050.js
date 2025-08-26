(() => {
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>[...r.querySelectorAll(s)];

  const ST = {
    level: (window.BLUSH?.DEFAULT_LEVEL)||1,
    minutes: 1, voice: null, rate: 1.0,
    story: '',
    vocab: {L4_SOFT:[],L5_STRONG:[],BLOCKED:[]},
    cards: [],
    antiRepeat: new Set(),           // global anti-repetition för fraser
    lastUsedByLevel: {4:new Set(),5:new Set()} // separat anti-repetition per nivå
  };

  // ---- Tabs
  $$('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const id = btn.dataset.tab;
      $$('.view').forEach(v=>v.classList.remove('active'));
      $('#'+id).classList.add('active');
    });
  });

  // ---- Nivåer
  const levelChips = $('#levelChips');
  if (levelChips) {
    levelChips.addEventListener('click', (e)=>{
      const b = e.target.closest('.chip'); if(!b) return;
      $$('#levelChips .chip').forEach(x=>x.classList.remove('selected'));
      b.classList.add('selected'); ST.level = +b.dataset.level;
    });
  }

  // ---- Längd
  const lenChips = $('#lenChips');
  if (lenChips) {
    lenChips.addEventListener('click', (e)=>{
      const b = e.target.closest('.chip'); if(!b) return;
      $$('#lenChips .chip').forEach(x=>x.classList.remove('selected'));
      b.classList.add('selected'); ST.minutes = +b.dataset.min;
    });
  }

  // ---- Tempo & röster (web speech fallback)
  const rate = $('#rate'), rateVal = $('#rateVal');
  if (rate && rateVal) {
    rate.addEventListener('input', ()=>{ ST.rate=+rate.value; rateVal.textContent=ST.rate.toFixed(2)+'×'; });
  }

  const voiceSel = $('#voiceSel');
  function populateVoices(){
    if (!voiceSel) return;
    const vs = speechSynthesis.getVoices();
    voiceSel.innerHTML = '';
    (vs.length?vs:[{name:'Default',lang:'sv-SE'}]).forEach(v=>{
      const o = document.createElement('option');
      o.value=v.name; o.textContent=`${v.name}${v.lang?' ('+v.lang+')':''}`;
      voiceSel.appendChild(o);
    });
    ST.voice = voiceSel.value;
  }
  if (voiceSel) {
    speechSynthesis.onvoiceschanged = populateVoices;
    populateVoices();
    voiceSel.addEventListener('change', ()=> ST.voice = voiceSel.value);
  }

  // ---- Devtools (lokal TTS-nyckel om du vill använda OpenAI TTS senare)
  const btnApiKey = $('#btnApiKey');
  if (btnApiKey) {
    btnApiKey.addEventListener('click', ()=>{
      const key = prompt('Klistra in din OPENAI_API_KEY (lagras lokalt i denna webbläsare):', localStorage.getItem('OPENAI_API_KEY')||'');
      if(key){ localStorage.setItem('OPENAI_API_KEY', key.trim()); alert('Sparad.'); }
    });
  }
  const btnRescue = $('#btnRescue');
  if (btnRescue) btnRescue.addEventListener('click', ()=> alert('Rescue: UI lever.'));

  // ---- Lexicon: ALLT läses från lexicon.json (vocab + kort)
  async function loadLexicon(){
    const url = 'lexicon.json?ts=' + Date.now(); // cache-bust
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error('Kunde inte läsa lexicon.json');
    const j = await res.json();

    // Förväntad struktur:
    // { vocab: {L4_SOFT:[],L5_STRONG:[],BLOCKED:[]}, cards:[{id,title,desc,tags,length}...] }
    ST.vocab = Object.assign({L4_SOFT:[],L5_STRONG:[],BLOCKED:[]}, j.vocab||{});
    ST.cards = Array.isArray(j.cards)? j.cards : [];

    renderCards();
  }

  function renderCards(){
    const wrap = $('#cards'); if (!wrap) return;
    wrap.innerHTML = '';
    (ST.cards.slice(0, (window.BLUSH?.NUM_CARDS)||8)).forEach(card=>{
      const el = document.createElement('div'); el.className='card';
      el.innerHTML = `
        <h3>${card.title||'Titel'}</h3>
        <p class="muted">${(card.desc||'').slice(0,160)}</p>
        <div class="row">
          <button class="btn" data-act="save" data-id="${card.id||''}">Spara</button>
          <button class="btn" data-act="listen" data-id="${card.id||''}">Lyssna</button>
        </div>`;
      el.querySelector('[data-act="listen"]').addEventListener('click', async ()=>{
        const idea = `${card.title||''} — ${card.desc||''}`;
        $('#idea') && ($('#idea').value = idea);
        await generateStory(idea);
        speak(ST.story);
      });
      el.querySelector('[data-act="save"]').addEventListener('click', ()=>{
        const favs = JSON.parse(localStorage.getItem('BN_FAV')||'[]');
        favs.push({id:card.id, t:card.title, d:card.desc, ts:Date.now()});
        localStorage.setItem('BN_FAV', JSON.stringify(favs));
      });
      wrap.appendChild(el);
    });
  }

  // ---- Anti-repetition sampling (per nivå + global) för hög throughput
  function sampleUnique(arr, k=4, level=5){
    if(!arr || !arr.length) return [];
    const levelSet = ST.lastUsedByLevel[level] || new Set();

    // filtrera bort nyligen använda globalt och på denna nivå
    const pool = arr.filter(x=>!ST.antiRepeat.has(x) && !levelSet.has(x));
    const src = pool.length >= k ? pool : arr.slice(); // fallback om för lite nytt

    const out = [];
    while(out.length < Math.min(k, src.length)){
      const idx = Math.floor(Math.random()*src.length);
      out.push(src.splice(idx,1)[0]);
    }

    // markera som nyligen använda (glöm efter N)
    out.forEach(x=> { ST.antiRepeat.add(x); levelSet.add(x); });
    ST.lastUsedByLevel[level] = levelSet;

    // cap-size (glöm äldsta) för att undvika växande set vid 10M/dag
    const capGlobal = 500, capLevel = 200;
    while (ST.antiRepeat.size > capGlobal) {
      const first = ST.antiRepeat.values().next().value;
      ST.antiRepeat.delete(first);
    }
    while (levelSet.size > capLevel) {
      const first = levelSet.values().next().value;
      levelSet.delete(first);
    }
    return out;
  }

  // ---- Prompt builder – använder ENDAST lexicon.json
  function buildPrompt(idea){
    const L4 = ST.vocab.L4_SOFT||[];
    const L5 = ST.vocab.L5_STRONG||[];
    const BL = ST.vocab.BLOCKED||[];

    const lenGuide = ST.minutes===1 ? "120–180 ord" : ST.minutes===3 ? "350–500 ord" : "650–900 ord";
    const baseTone = ST.level===1 ? "romantisk, låg intensitet" :
                     ST.level===3 ? "sensuell vuxen nivå" :
                     "hög intensitet (lagligt och samtycke)";

    // Välj 4–5 uttryck per berättelse, sparsamt
    const k = Math.floor(4 + Math.random()*2); // 4–5
    let chosen = [];
    if (ST.level === 5 && L5.length){
      chosen = sampleUnique(L5, k, 5);
    } else if (ST.level === 4 && L4.length){
      chosen = sampleUnique(L4, k, 4);
    }

    // Hints-formulering – tydlig men icke-tvingande
    let hints = "";
    if (chosen.length) {
      hints += `Baka in följande uttryck sparsamt och naturligt (variera synonymer där det passar): ${chosen.join(", ")}. `;
    } else if (ST.level <= 3) {
      hints += `Undvik explicit grovt språk. `;
    }
    if (BL.length) {
      hints += `FÅR INTE förekomma: ${BL.join(", ")}. `;
    }

    const system = [
      "Du är en svensk berättarröst som skriver erotiska noveller.",
      "Skriv i jag-form, naturlig dialog, sensuell ton.",
      "Allt innehåll ska vara samtyckande och vuxet; inga förbjudna teman.",
      `Nivå: ${baseTone}. Längd: ${lenGuide}.`,
      "Använd stycken, tempo, pauser och avsluta med mjuk landning.",
      hints
    ].join(" ");

    const user = idea && idea.trim()
      ? `Utgå från idén: ${idea.trim()}`
      : "Skapa en fristående scen med närvaro. Undvik onödiga upprepningar.";

    return { system, user };
  }

  // ---- Generera via server (Cloudflare Functions) med robust fallback
  async function generateStory(overrideIdea){
    const ideaEl = $('#idea');
    const idea = typeof overrideIdea==='string' ? overrideIdea : (ideaEl?ideaEl.value:'');
    const {system,user} = buildPrompt(idea);

    $('#status') && ($('#status').textContent = 'Genererar…');
    $('#story') && ($('#story').textContent = '');
    try{
      const res = await fetch('/api/generate', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ system, user, level: ST.level, minutes: ST.minutes })
      });
      if(!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const text = (data.text||'').trim();
      if(!text) throw new Error('Tomt svar');
      ST.story = text;
      $('#story') && ($('#story').textContent = text);
      $('#status') && ($('#status').textContent = 'Klart.');
    }catch(err){
      console.warn('API-fel', err);
      if((window.BLUSH?.DEMO_FALLBACK)){
        const demo = demoText();
        ST.story = demo; $('#story') && ($('#story').textContent = demo);
        $('#status') && ($('#status').textContent = 'Fallback (demo-text).');
      }else{
        $('#status') && ($('#status').textContent = 'Misslyckades (se konsolen).');
      }
    }
  }

  function demoText(){
    const seed = ST.level>=4
      ? 'Närheten slog upp mellan oss och varje rörelse blev tydligare.'
      : 'Vi kom nära, långsamt och mjukt, med en varm blick som stannade.';
    return `${seed} (demo — använd servern för riktig text)`;
  }

  // ---- Web Speech fallback (enkel lokal uppläsning)
  function speak(text){
    try{ speechSynthesis.cancel(); }catch{}
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = ST.rate;
    const v = speechSynthesis.getVoices().find(x=>x.name===ST.voice) ||
              speechSynthesis.getVoices().find(x=>/sv|swedish/i.test(x.lang)) ||
              speechSynthesis.getVoices()[0];
    if(v) u.voice = v;
    speechSynthesis.speak(u);
  }

  // ---- Events
  const btnGen = $('#btnGenerate');
  if (btnGen) btnGen.addEventListener('click', ()=>generateStory());
  const btnListen = $('#btnListen');
  if (btnListen) btnListen.addEventListener('click', ()=>{ if(ST.story) speak(ST.story); });
  const btnStop = $('#btnStop');
  if (btnStop) btnStop.addEventListener('click', ()=> speechSynthesis.cancel());

  // ---- Init
  (async ()=>{
    try { await loadLexicon(); } catch(e){ console.warn(e); }
    $('#status') && ($('#status').textContent = 'BN v0.6.1 laddad');
  })();
})();
