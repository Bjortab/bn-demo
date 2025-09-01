// BN front – Golden Copy (prompt fix + robust TTS)

(() => {
  // UI refs
  const ideaEl   = document.getElementById('idea');      // <-- VIKTIG
  const levelEl  = document.getElementById('level');
  const lenEl    = document.getElementById('length');
  const voiceEl  = document.getElementById('voice');
  const tempoEl  = document.getElementById('tempo');

  const btnGen   = document.getElementById('btnGen');
  const btnPlay  = document.getElementById('btnPlay');
  const btnStop  = document.getElementById('btnStop');

  const audioEl  = document.getElementById('audioEl');
  const statusEl = document.getElementById('status');
  const providerEl = document.getElementById('provider');
  const modelEl    = document.getElementById('model');
  const logEl    = document.getElementById('log');

  let lastText = '';
  let lastAudioURL = '';

  function now() {
    const d = new Date();
    return `[${d.toLocaleTimeString()}]`;
  }

  function log(line) {
    logEl.textContent += `${now()} ${line}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function setBusy(b) {
    btnGen.disabled = b;
    btnPlay.disabled = b;
    btnStop.disabled = !b && audioEl.paused;
  }

  async function healthCheck() {
    try {
      const r = await fetch('/api/health');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const js = await r.json().catch(()=>({ok:true}));
      setStatus('API: ok');
      log('API: ok');
    } catch (e) {
      setStatus(`API: fel – ${String(e)}`);
      log(`API: fel – ${String(e)}`);
    }
  }

  // --- Generate story then ask TTS ---
  async function generate() {
    // Läs prompten SÄKERT
    const idea = (ideaEl.value || '').trim();

    if (!idea) {
      setStatus('Skriv en idé först.');
      log('Ingen prompt angiven.');
      return;
    }

    // reset vy
    providerEl.textContent = '-';
    modelEl.textContent = '-';
    lastText = '';
    if (lastAudioURL) {
      URL.revokeObjectURL(lastAudioURL);
      lastAudioURL = '';
    }
    audioEl.removeAttribute('src');

    const payload = {
      idea,
      level: Number(levelEl.value),
      minutes: Number(lenEl.value),
      voice: voiceEl.value,
      tempo: Number(tempoEl.value)
    };

    setBusy(true);
    setStatus('Genererar…');
    log('Genererar…');

    try {
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify(payload)
      });

      if (!r.ok) {
        const txt = await r.text().catch(()=> '');
        setStatus(`Fel vid generering: HTTP ${r.status}`);
        log(`Fel vid generering: HTTP ${r.status}\n${txt}`);
        setBusy(false);
        return;
      }

      const data = await r.json();
      if (!data || data.ok === false) {
        setStatus(`Fel: ${data?.error || 'ok:false'}`);
        log(`Fel: ${data?.error || 'ok:false'}`);
        setBusy(false);
        return;
      }

      // Stöd både data.text och data.story
      const story = (data.text || data.story || '').trim();
      if (!story) {
        setStatus('Fel: tom berättelse från API.');
        log('Tom berättelse från API.');
        setBusy(false);
        return;
      }

      lastText = story;
      providerEl.textContent = data.provider || '-';
      modelEl.textContent = data.model || '-';

      // Visa i status (för debug)
      setStatus('Klart.');
      log('(klart)');

      // Starta TTS direkt
      await speak();
    } catch (e) {
      setStatus(`Fel: ${String(e)}`);
      log(`Fel: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function speak() {
    if (!lastText) {
      setStatus('Ingen text att läsa upp.');
      log('Ingen text att läsa upp.');
      return;
    }
    setStatus('Väntar röst…');
    log('Väntar röst…');

    // iOS kräver interaktion—försök trigga uppspelning efter fetch
    try {
      const r = await fetch('/api/tts', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({
          text: lastText,
          voice: voiceEl.value,
          tempo: Number(tempoEl.value)
        })
      });

      if (!r.ok) {
        const t = await r.text().catch(()=> '');
        log(`TTS-fel: HTTP ${r.status}`);
        log(t || '');
        setStatus('TTS-fel.');
        return;
      }

      const blob = await r.blob();
      if (!blob || !blob.size) {
        log('TTS: ingen <audio>.');
        setStatus('TTS: ingen audio.');
        return;
      }

      if (lastAudioURL) URL.revokeObjectURL(lastAudioURL);
      lastAudioURL = URL.createObjectURL(blob);
      audioEl.src = lastAudioURL;

      // Autoplay kan blockeras på iOS – kräver klick
      const p = audioEl.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          log('TTS: kräver extra klick (iOS).');
          setStatus('Tryck på Lyssna för att spela.');
        });
      }
    } catch (e) {
      log(`TTS-fel: ${String(e)}`);
      setStatus(`TTS-fel: ${String(e)}`);
    }
  }

  function stopAudio() {
    try { audioEl.pause(); } catch {}
    setStatus('Stoppad.');
  }

  // events
  btnGen.addEventListener('click', generate);
  btnPlay.addEventListener('click', speak);
  btnStop.addEventListener('click', stopAudio);

  // init
  log('(tomt)');
  healthCheck();
})();
