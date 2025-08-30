// public/app.js — BN front GC v1.4
(() => {
  const $ = (q) => document.querySelector(q);

  const out = $('#output');
  const storyEl = $('#story');
  const btnGen = $('#generateBtn');
  const btnPlay = $('#listenBtn');
  const btnStop = $('#stopBtn');
  const audioEl = $('#audio');

  const appendStatus = (t) => {
    const ts = new Date().toLocaleTimeString();
    out.textContent += `\n[${ts}] ${t}`;
    out.scrollTop = out.scrollHeight;
  };

  async function safePlayMp3Buffer(buf, attempt = 1) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([buf], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      try { audioEl.pause(); } catch {}
      audioEl.removeAttribute('src');
      audioEl.setAttribute('playsinline', '');
      audioEl.preload = 'auto';
      audioEl.src = url + `?t=${Date.now()}`;

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        try { URL.revokeObjectURL(url); } catch {}
        audioEl.onerror = null;
        audioEl.oncanplaythrough = null;
      };

      audioEl.onerror = () => {
        cleanup();
        if (attempt < 2) {
          appendStatus('TTS: laddning misslyckades – försöker igen…');
          setTimeout(() => safePlayMp3Buffer(buf, attempt + 1).then(resolve).catch(reject), 400);
        } else reject(new Error('Load failed'));
      };

      audioEl.oncanplaythrough = () => {
        setTimeout(() => {
          audioEl.play()
            .then(resolve)
            .catch((err) => {
              if (attempt < 2) {
                appendStatus('TTS: autoplay misslyckades – försöker igen…');
                setTimeout(() => safePlayMp3Buffer(buf, attempt + 1).then(resolve).catch(reject), 400);
              } else reject(err);
            });
        }, 60);
      };

      audioEl.onended = () => cleanup();
      try { audioEl.load(); } catch {}
    });
  }

  async function fetchTTS(text, voice, level) {
    appendStatus('Väntar röst…');
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice, level })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`TTS HTTP ${res.status}: ${body || '—'}`);
    }
    const buf = await res.arrayBuffer();
    await safePlayMp3Buffer(buf);
    appendStatus('Spelar röst ✅');
  }

  btnGen.addEventListener('click', async () => {
    out.textContent = '';
    storyEl.textContent = '';
    appendStatus('Genererar…');

    const idea = $('#idea').value.trim();
    const level = Number($('#level').value);
    const minutes = Number($('#minutes').value || 5);
    const voice = $('#voice').value || 'alloy';

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idea, level, minutes })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.detail || data.error || 'Fel vid generering');
      storyEl.textContent = data.text;
      appendStatus('(text klar)');
      await fetchTTS(data.text, voice, level);
    } catch (err) {
      appendStatus(`Fel: ${err.message || err}`);
      if (/429|openrouter_5\d\d/.test(String(err))) {
        appendStatus('Servern är upptagen – försök igen om någon minut.');
      }
    }
  });

  btnPlay.addEventListener('click', () => { try { audioEl.play(); } catch {} });
  btnStop.addEventListener('click', () => { try { audioEl.pause(); audioEl.currentTime = 0; } catch {} });
})();
