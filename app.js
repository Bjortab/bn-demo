// app.js – BN frontend v1.1 (robust init)
(() => {
  const $ = (s) => document.querySelector(s);

  // UI refs
  const elLevel  = $('#level');
  const elLen    = $('#length');
  const elVoice  = $('#voice');
  const elTempo  = $('#tempo');
  const elIdea   = $('#idea');
  const btnGen   = $('#generateBtn');
  const btnPlay  = $('#listenBtn');
  const btnStop  = $('#stopBtn');
  const out      = $('#output');
  const apiBadge = $('#apiStatus');

  // helper
  function setBusy(on) {
    [btnGen, btnPlay, btnStop].forEach(b => b && (b.disabled = !!on));
  }

  async function apiHealth() {
    try {
      const r = await fetch('/api/health', { cache:'no-store' });
      const j = await r.json();
      apiBadge.textContent = j.ok ? 'API: ok' : 'API: fel';
      return !!j.ok;
    } catch {
      apiBadge.textContent = 'API: fel';
      return false;
    }
  }

  async function doGenerate() {
    setBusy(true);
    out.textContent = 'Genererar…';
    try {
      const payload = {
        idea: elIdea.value || '',
        level: Number(elLevel.value || 3),
        minutes: Number(elLen.value || 3)
      };
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok || !j.ok) {
        alert('Kunde inte generera: ' + (j.error || r.statusText));
        out.textContent = '';
        return;
      }
      out.textContent = j.story || '(tomt)';
    } catch (e) {
      console.error(e);
      alert('Ett fel uppstod vid generering.');
    } finally {
      setBusy(false);
    }
  }

  let currentAudio = null;
  async function doTTS() {
    const text = out.textContent.trim();
    if (!text) { alert('Ingen text att läsa'); return; }
    setBusy(true);
    try {
      const payload = {
        text,
        voice: elVoice.value || 'alloy',
        speed: Number(elTempo.value || 1.0)
      };
      const r = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const msg = await r.text().catch(()=> r.statusText);
        alert('TTS-fel: ' + msg);
        return;
      }
      const blob = await r.blob();
      currentAudio?.pause?.();
      currentAudio = new Audio(URL.createObjectURL(blob));
      currentAudio.play();
    } catch (e) {
      console.error(e);
      alert('Ett fel uppstod vid uppläsningen.');
    } finally {
      setBusy(false);
    }
  }

  function stopAudio() {
    try { currentAudio?.pause?.(); } catch {}
  }

  // Bindningar – robust (även om nåt kastar)
  try {
    btnGen?.addEventListener('click', doGenerate);
    btnPlay?.addEventListener('click', doTTS);
    btnStop?.addEventListener('click', stopAudio);
  } catch (e) {
    console.error('Bind error', e);
  }

  // start
  apiHealth();
})();
