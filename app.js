// app.js (BN front — stabil TTS)
(() => {
  const $ = s => document.querySelector(s);

  const selLevel   = $('#level');
  const selLength  = $('#length');
  const selVoice   = $('#voice');
  const tempo      = $('#tempo');
  const idea       = $('#idea');
  const btnGen     = $('#btnGen');
  const btnPlay    = $('#btnPlay');
  const btnStop    = $('#btnStop');
  const statusEl   = $('#status');
  const storyEl    = $('#story');
  const providerEl = $('#provider');
  const modelEl    = $('#model');
  const audioEl    = $('#audio');

  let busy = false;
  let lastStory = '';

  function log(line) {
    const now = new Date().toTimeString().slice(0,8);
    statusEl.textContent += `\n[${now}] ${line}`;
    statusEl.scrollTop = statusEl.scrollHeight;
  }
  function setBusy(b) {
    busy = b;
    btnGen.disabled = b;
    btnPlay.disabled = b;
    btnStop.disabled = !b && audioEl.paused;
  }

  async function health() {
    try {
      const res = await fetch('/api/version');
      const j = await res.json();
      providerEl.textContent = 'openrouter'; // sätts av backendet i generate.js vid text
      modelEl.textContent = j.tts_engine || '-';
      log('BN front laddad.');
      if (!j.has_eleven_key) log('VARNING: saknar ELEVENLABS_API_KEY');
      if (!j.has_kv) log('VARNING: saknar KV-binding BN_AUDIO');
    } catch {
      log('Kunde inte läsa /api/version');
    }
  }

  async function generate() {
    if (busy) return;
    const text = (idea.value || '').trim();
    if (!text) { log('Skriv en idé först.'); return; }

    setBusy(true); log('Genererar…');
    storyEl.textContent = '';
    lastStory = '';

    try {
      const body = {
        level: Number(selLevel.value),
        minutes: Number(selLength.value),
        idea: text,
        tempo: Number(tempo.value),
        voice: selVoice.value || ''
      };
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify(body)
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);

      providerEl.textContent = j.provider || '-';
      modelEl.textContent = j.model || '-';

      lastStory = (j.text || '').trim();
      storyEl.textContent = lastStory;

      // Vänta tills [SLUT] finns innan TTS
      if (!/\[SLUT\]/.test(lastStory)) {
        log('VARNING: text saknar [SLUT] – TTS kan klippa.');
      }

      await speak(lastStory);
      log('Klart.');
    } catch (e) {
      log(`Fel: ${String(e.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function speak(text) {
    log('Väntar röst…');
    // iOS kräver user-gesture: om vi får NotAllowedError, be om extra klick
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({ text, voice: selVoice.value })
    });

    if (res.headers.get('content-type')?.includes('application/json')) {
      const j = await res.json().catch(() => ({}));
      throw new Error(`TTS: ${j.error || 'okänd JSON'}`);
    }
    if (!res.ok) throw new Error(`TTS: HTTP ${res.status}`);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    // Städa ev. tidigare src
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();

    audioEl.src = url;

    try {
      await audioEl.play();
    } catch (err) {
      // Kräver klick på iOS
      log('TTS: kräver extra klick (iOS).');
    }
  }

  btnGen.addEventListener('click', generate);
  btnPlay.addEventListener('click', async () => {
    if (!audioEl.src) {
      if (!lastStory) { log('Ingen text finns. Generera först.'); return; }
      await speak(lastStory);
    } else {
      try { await audioEl.play(); } catch { log('TTS: klicka Lyssna igen.'); }
    }
  });
  btnStop.addEventListener('click', () => { audioEl.pause(); });

  // Autologg på slut
  audioEl.addEventListener('ended', () => {
    log('Uppspelning slut.');
  });

  health();
})();
