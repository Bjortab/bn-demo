// app.js – Golden Copy v1.3b (ingen auto-timeout; Stop avbryter)
const $ = (q) => document.querySelector(q);

// UI element
const elLevel  = $('#level');
const elLen    = $('#length');
const elVoice  = $('#voice');
const elTempo  = $('#tempo');
const elIdea   = $('#userIdea');
const elOut    = $('#output');
const btnGen   = $('#generateBtn');
const btnPlay  = $('#listenBtn');
const btnStop  = $('#stopBtn');
const elApiOk  = $('#apiok');

const BASE = location.origin + '/api';

let audio = null;
let isBusy = false;
let keepPing = null;
let currentAbort = null;

// helpers
function setBusy(on) {
  isBusy = !!on;
  btnGen.disabled = on;
  btnPlay.disabled = on;
  btnStop.disabled = on;
  document.body.classList.toggle('busy', on);
}

async function checkHealth() {
  try {
    const res = await fetch(BASE + '/health');
    const data = await res.json().catch(()=>({}));
    const ok = res.ok && data.ok;
    if (elApiOk) elApiOk.textContent = ok ? 'ok' : 'fail';
  } catch {
    if (elApiOk) elApiOk.textContent = 'fail';
  }
}

function startKeepAlive() {
  stopKeepAlive();
  keepPing = setInterval(() => { fetch(BASE + '/health').catch(()=>{}); }, 60000);
}
function stopKeepAlive() {
  if (keepPing) { clearInterval(keepPing); keepPing = null; }
}

function params() {
  return {
    idea: (elIdea.value || '').trim(),
    level: Number(elLevel.value || 3),
    minutes: Number(elLen.value || 5),
    voice: elVoice.value || 'alloy',
    tempo: Number(elTempo.value || 1.0)
  };
}

function setText(t) { elOut.textContent = t || ''; }

// —— Generate —— //
btnGen?.addEventListener('click', async () => {
  if (isBusy) return;
  const { idea, level, minutes, voice, tempo } = params();
  if (!idea) { setText('(skriv en idé först)'); return; }

  // avbryt ev. tidigare
  if (currentAbort) { try { currentAbort.abort(); } catch {} }
  currentAbort = new AbortController();

  setBusy(true);
  setText('(genererar …)');

  try {
    const res = await fetch(BASE + '/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea, level, minutes, voice, tempo }),
      signal: currentAbort.signal
    });

    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = j && j.error ? j.error : ''; } catch {}
      setText(`(fel vid generering – ${res.status}${detail ? `: ${detail}` : ''})`);
      return;
    }

    const data = await res.json().catch(()=> ({}));
    const story = data && data.story ? String(data.story) : '';
    if (!story) { setText('(kunde inte generera – tomt svar)'); return; }

    setText(story);
  } catch (err) {
    if (err?.name === 'AbortError') {
      setText('(avbrutet)');
    } else {
      console.error('generate error', err);
      setText('(fel vid generering)');
    }
  } finally {
    setBusy(false);
  }
});

// —— TTS —— //
btnPlay?.addEventListener('click', async () => {
  if (isBusy) return;
  const text = elOut.textContent.trim();
  if (!text) return;

  setBusy(true);
  try {
    const res = await fetch(BASE + '/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice: elVoice.value || 'alloy', speed: Number(elTempo.value || 1.0) })
    });

    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = j && j.error ? j.error : ''; } catch {}
      setText(`(TTS fel – ${res.status}${detail ? `: ${detail}` : ''})`);
      return;
    }

    const buf = await res.arrayBuffer();
    audio?.pause();
    audio = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' })));
    await audio.play().catch(()=>{});
  } catch (e) {
    console.error('TTS error', e);
  } finally {
    setBusy(false);
  }
});

// —— Stop —— //
btnStop?.addEventListener('click', () => {
  try { audio?.pause(); } catch {}
  try { currentAbort?.abort(); } catch {}
});

// init
checkHealth();
startKeepAlive();
window.addEventListener('beforeunload', stopKeepAlive);
