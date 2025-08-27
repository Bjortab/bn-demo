// app.js – Golden Copy v1.3a  (timeout per längd, ingen 10s-stop)
const $ = (q) => document.querySelector(q);

// UI
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

// API-bas (Cloudflare Pages)
const BASE = location.origin + '/api';

let audio = null;
let isBusy = false;
let keepPing;

// —— Hjälp —— //
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
    const ok  = res.ok && (await res.json()).ok;
    if (elApiOk) elApiOk.textContent = ok ? 'ok' : 'fail';
  } catch {
    if (elApiOk) elApiOk.textContent = 'fail';
  }
}

// håll backend “varm” medan fliken är öppen
function startKeepAlive() {
  stopKeepAlive();
  keepPing = setInterval(() => {
    fetch(BASE + '/health').catch(()=>{});
  }, 60000);
}
function stopKeepAlive() {
  if (keepPing) clearInterval(keepPing), keepPing = null;
}

function getParams() {
  const mins = elLen.value; // "5" | "10" | "15"
  return {
    idea: (elIdea.value || '').trim(),
    level: Number(elLevel.value || 3),
    minutes: Number(mins || 5),
    voice: elVoice.value || 'alloy',
    tempo: Number(elTempo.value || 1.0),
  };
}

function setText(t) {
  elOut.textContent = t || '';
}

function appendText(t) {
  elOut.textContent += t;
}

// —— Generera —— //
btnGen?.addEventListener('click', async () => {
  if (isBusy) return;
  const { idea, level, minutes, voice, tempo } = getParams();
  if (!idea) { setText('(skriv en idé först)'); return; }

  // dynamisk timeout per längd (upplevd tid / API-roundtrip)
  const timeouts = { 5: 25000, 10: 45000, 15: 60000 };
  const ms = timeouts[minutes] || 30000;

  // AbortController med per-längd-timeout
  const ac = new AbortController();
  const tId = setTimeout(() => ac.abort(new Error('timeout')), ms);

  setBusy(true);
  setText('(genererar …)');

  try {
    const res = await fetch(BASE + '/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea, level, minutes, voice, tempo }),
      signal: ac.signal
    });

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch {}
      setText(`(fel vid generering – ${res.status}${detail ? `: ${detail}`:''})`);
      return;
    }

    // rätta svaret: { ok:true, story: "..." }
    const data = await res.json().catch(() => ({}));
    const story = (data && data.story) ? String(data.story) : '';

    if (!story) {
      setText('(kunde inte generera – tomt svar)');
      return;
    }

    setText(story);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      setText('(avbröts: timeout – öka längd-timeout eller försök igen)');
    } else {
      setText('(fel vid generering)');
      console.error('generate error', err);
    }
  } finally {
    clearTimeout(tId);
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
      try { detail = (await res.json()).error || ''; } catch {}
      setText(`(TTS fel – ${res.status}${detail ? `: ${detail}`:''})`);
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

btnStop?.addEventListener('click', () => {
  try { audio?.pause(); } catch {}
});

// Init
checkHealth();
startKeepAlive();
window.addEventListener('beforeunload', stopKeepAlive);
