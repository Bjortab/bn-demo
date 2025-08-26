(() => {
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>[...r.querySelectorAll(s)];

  const ST = {
    level: 5,
    minutes: 3,
    voice: 'alloy',
    rate: 1.0,
    story: ''
  };

  // UI wire-up
  function initUI(){
    // Nivå
    $('#chipsLevel').addEventListener('click', e=>{
      const b = e.target.closest('.chip'); if(!b) return;
      $$('#chipsLevel .chip').forEach(x=>x.classList.remove('chip-on'));
      b.classList.add('chip-on');
      ST.level = +b.dataset.level;
    });

    // Längd
    $('#chipsLen').addEventListener('click', e=>{
      const b = e.target.closest('.chip'); if(!b) return;
      $$('#chipsLen .chip').forEach(x=>x.classList.remove('chip-on'));
      b.classList.add('chip-on');
      ST.minutes = +b.dataset.min;
    });

    // Röst/tempo
    $('#voice').addEventListener('change', e=> ST.voice = e.target.value);
    const rate = $('#rate'), rateVal = $('#rateVal');
    rate.addEventListener('input', ()=>{ ST.rate = +rate.value; rateVal.textContent = ST.rate.toFixed(2)+'×'; });

    // Knappar
    $('#btnGenerate').addEventListener('click', onGenerate);
    $('#btnListen').addEventListener('click', onListen);
    $('#btnStop').addEventListener('click', stopAudio);

    // Health
    $('#btnHealth').addEventListener('click', checkHealth);

    // Startstatus
    setStatus('BN front v1.0 – laddad');
  }

  function setStatus(t){ $('#status').textContent = t; }

  async function checkHealth(){
    try{
      const r = await fetch('/api/health?ts='+Date.now(), {cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j = await r.json();
      setStatus(`API: OK v${j.v||'?'} (${new Date(j.ts).toLocaleTimeString()})`);
    }catch(e){
      setStatus('API: OFF – använder bara demo-fall­back');
    }
  }

  // Generera via server (Cloudflare Functions)
  async function onGenerate(){
    const idea = ($('#idea')?.value||'').trim();
    setStatus('Genererar… (server)');
    $('#story').textContent = '';

    try{
      const res = await fetch('/api/generate', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({ idea, level: ST.level, minutes: ST.minutes })
      });
      const data = await res.json();
      if(!res.ok || !data?.ok) throw new Error(data?.error||('HTTP '+res.status));
      ST.story = (data.text||'').trim();
      $('#story').textContent = ST.story || '(tomt svar)';
      setStatus('Klart. Källa: OpenAI (server) ✓');
    }catch(err){
      setStatus('Misslyckades – se konsolen. Faller tillbaka på DEMO.');
      console.warn('generate error', err);
      ST.story = demoText();
      $('#story').textContent = ST.story;
    }
  }

  // TTS via server (Cloudflare Functions)
  async function onListen(){
    const text = ST.story || ($('#story').textContent||'').trim();
    if(!text){ setStatus('Skapa en berättelse först.'); return; }
    setStatus('Skapar röst… (server)');
    try{
      const res = await fetch('/api/tts', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({ text, voice: ST.voice, speed: ST.rate })
      });
      if(!res.ok) throw new Error('TTS HTTP '+res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = $('#audio');
      a.src = url;
      a.playbackRate = 1.0;          // låt servern styra hastighet
      await a.play();
      setStatus('Spelar upp ✓');
    }catch(err){
      console.warn('tts error', err);
      setStatus('TTS misslyckades – ingen röst.');
    }
  }

  function stopAudio(){
    const a = $('#audio'); a.pause(); a.currentTime = 0;
    setStatus('Stoppad.');
  }

  function demoText(){
    return 'Demo: Närheten slog upp mellan oss och varje rörelse blev tydligare. (Använder fallback – API ej nått.)';
  }

  // Init
  document.addEventListener('DOMContentLoaded', ()=>{
    initUI();
    checkHealth(); // visa direkt om API lever
  });
})();
