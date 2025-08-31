// app.js — BlushNarratives Front v1.4 (Golden Copy)
// Visar provider/modell, robust TTS (iOS-klik), tydlig statuslogg, caching av ljud.

(() => {
  const $ = (sel) => document.querySelector(sel);

  // UI-element
  const levelSel   = $('#level');
  const lengthSel  = $('#length');
  const voiceSel   = $('#voice');
  const tempoInp   = $('#tempo');
  const ideaTA     = $('#userIdea');

  const btnGen     = $('#generateBtn');
  const btnListen  = $('#listenBtn');
  const btnStop    = $('#stopBtn');

  const outPre     = $('#output');
  const storyArt   = $('#story');
  const audioEl    = $('#audio');

  // Status-ruta överst (om du har dessa fält i HTML – annars skapas de)
  let providerSpan = document.getElementById('providerVal');
  let modelSpan    = document.getElementById('modelVal');
  let statusSpan   = document.getElementById('statusVal');

  // Om saknas – skapa enkel statusrad överst
  if (!statusSpan) {
    const header = document.createElement('div');
    header.style.margin = '8px 0 16px';
    header.innerHTML = `
      <div><strong>Status:</strong> <span id="statusVal">–</span></div>
      <div><strong>Provider:</strong> <span id="providerVal">–</span></div>
      <div><strong>Modell:</strong> <span id="modelVal">–</span></div>
    `;
    const title = document.querySelector('h1,h2') || document.body.firstElementChild;
    (title?.parentNode || document.body).insertBefore(header, title?.nextSibling || null);
    providerSpan = header.querySelector('#providerVal');
    modelSpan    = header.querySelector('#modelVal');
    statusSpan   = header.querySelector('#statusVal');
  }

  // App-state
  let busyGen   = false;
  let ttsBusy   = false;
  let lastText  = '';
  let lastAudioURL = null; // ObjectURL / dataURL från TTS
  let lastVoice = '';
  let lastTempo = 1.0;
  let lastProv  = '-';
  let lastModel = '-';

  // Hjälp
  function setBusy(b) {
    busyGen = b;
    btnGen.disabled    = b;
    btnListen.disabled = b; // lås lyssna under generering, öppnas efter
    btnStop.disabled   = false;
  }

  function setStatus(line) {
    statusSpan.textContent = line;
  }
  function log(line) {
    const t = new Date().toLocaleTimeString();
    outPre.textContent += `[${t}] ${line}\n`;
    outPre.scrollTop = outPre.scrollHeight;
  }
  function clearOutput() {
    outPre.textContent = '(tomt)\n';
  }
  function setProviderModel(p, m) {
    providerSpan.textContent = p || '-';
    modelSpan.textContent    = m || '-';
  }

  function minutesFromSelect() {
    // Anta option.value innehåller siffror (t.ex. "5") eller "5 min"
    const raw = (lengthSel.value || '').toString();
    const m = parseInt(raw.replace(/[^\d]/g, ''), 10);
    return isNaN(m) ? 5 : m;
  }

  function voiceFromSelect() {
    return (voiceSel?.value || 'alloy').trim();
  }

  function tempoFromRange() {
    const v = parseFloat(tempoInp?.value || '1.0');
    if (isNaN(v)) return 1.0;
    return Math.max(0.8, Math.min(1.25, v));
  }

  async function checkAPI() {
    try {
      const r = await fetch('/api/health').then(r => r.json()).catch(() => null);
      if (r && r.ok) {
        log('API: ok');
      } else {
        log('API: fel');
      }
    } catch {
      log('API: fel');
    }
  }

  // -------- GENERATE --------
  async function onGenerate() {
    if (busyGen) return;
    const idea   = (ideaTA.value || '').trim();
    const level  = parseInt(levelSel.value || '3', 10) || 3;
    const mins   = minutesFromSelect();

    if (!idea) {
      log('Fel: tom idé.');
      return;
    }

    clearOutput();
    setStatus('Genererar…');
    log('Genererar…');
    setProviderModel('-', '-');
    setBusy(true);
    lastAudioURL = null;
    lastVoice    = voiceFromSelect();
    lastTempo    = tempoFromRange();

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idea, level, minutes: mins })
      });

      if (!res.ok) {
        const txt = await res.text().catch(()=>'');
        log(`Fel vid generering: HTTP ${res.status}`);
        if (txt) log(txt.slice(0, 400));
        setStatus('Fel vid generering.');
        return;
      }

      const data = await res.json();
      lastProv  = data.provider || '-';
      lastModel = data.model || '-';
      setProviderModel(lastProv, lastModel);

      lastText = (data.text || '').trim();
      // Visa i story
      storyArt.textContent = lastText;

      setStatus('Klart.');
      log('(klart)');

      // Efter generering: tillåt Lyssna
      btnListen.disabled = false;
      // Autostarta INTE (iOS blockerar) – visa tydligt
      log('Väntar röst…');

    } catch (err) {
      log(`Fel: ${err?.message || err}`);
      setStatus('Fel vid generering.');
    } finally {
      setBusy(false);
    }
  }

  // -------- TTS --------
  function stopAudio() {
    try { audioEl.pause(); } catch {}
    if (audioEl.src && audioEl.src.startsWith('blob:')) {
      URL.revokeObjectURL(audioEl.src);
    }
  }

  async function fetchTTSIfNeeded() {
    if (!lastText) {
      throw new Error('Ingen text att TTS:a');
    }
    if (lastAudioURL) return lastAudioURL;

    ttsBusy = true;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: lastText,
          voice: lastVoice,
          tempo: lastTempo
        })
      });

      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        const msg = `TTS-fel: HTTP ${res.status}`;
        log(msg);
        if (t) log(t.slice(0, 300));
        throw new Error(msg);
      }

      // Flex: kan vara audio/* eller JSON med base64/dataURL
      const ctype = (res.headers.get('content-type') || '').toLowerCase();

      if (ctype.startsWith('audio/')) {
        const blob = await res.blob();
        lastAudioURL = URL.createObjectURL(blob);
        return lastAudioURL;
      }

      // Annars tolka som JSON { ok, audio: <dataURL|base64> }
      const data = await res.json();
      let url = null;
      if (data && data.audio) {
        if (data.audio.startsWith('data:audio')) {
          url = data.audio;
        } else {
          // anta base64 mp3
          url = `data:audio/mpeg;base64,${data.audio}`;
        }
      }
      if (!url) throw new Error('TTS: ogiltigt svar');
      lastAudioURL = url;
      return lastAudioURL;

    } finally {
      ttsBusy = false;
    }
  }

  async function onListen() {
    try {
      setStatus('Hämtar röst…');
      log('Väntar röst…');
      const url = await fetchTTSIfNeeded();
      stopAudio(); // stäng ev. gammal
      audioEl.src = url;

      try {
        await audioEl.play();
        setStatus('Spelar upp.');
      } catch (e) {
        // iOS/autoplay kräver användarklick
        log('TTS: kräver extra klick (iOS).');
        setStatus('Klicka Lyssna igen för att starta.');
        // sätt upp one-shot på nästa användarklick
        const onFirstUser = async () => {
          document.removeEventListener('touchend', onFirstUser, true);
          document.removeEventListener('click', onFirstUser, true);
          try {
            await audioEl.play();
            setStatus('Spelar upp.');
          } catch (err) {
            log('TTS-fel: uppspelning.');
            setStatus('Uppspelningsfel.');
          }
        };
        document.addEventListener('touchend', onFirstUser, true);
        document.addEventListener('click', onFirstUser, true);
      }
    } catch (err) {
      log(`TTS-fel: ${err?.message || err}`);
      setStatus('TTS-fel.');
    }
  }

  function onStop() {
    stopAudio();
    setStatus('Stoppad.');
  }

  // Eventkopplingar
  btnGen?.addEventListener('click', onGenerate);
  btnListen?.addEventListener('click', onListen);
  btnStop?.addEventListener('click', onStop);

  // Init
  (function init() {
    clearOutput();
    btnListen.disabled = true;
    setProviderModel('-', '-');
    setStatus('Init…');
    checkAPI();
  })();
})();
