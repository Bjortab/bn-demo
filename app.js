// app.js — Golden Copy v1.3.2 (CF Pages)
// För BN UI. Matchar index.html-id:n exakt.

const $ = (q) => document.querySelector(q);

// Bindningar till HTML-element (måste matcha index.html)
const el = {
  level:       $('#level'),
  length:      $('#length'),
  voice:       $('#voice'),
  tempo:       $('#tempo'),
  userIdea:    $('#userIdea'),
  btnGenerate: $('#generateBtn'),
  btnListen:   $('#listenBtn'),
  btnStop:     $('#stopBtn'),
  output:      $('#output'),
  story:       $('#story'),
  audio:       $('#audio'),
  apiok:       $('#apiok') // valfritt, om du har en liten indikator
};

// Bas till Pages Functions
const BASE = location.origin + '/api';

let busyGen = false;
let busyTts = false;
let dotsTimer = null;

// ────────── UI helpers ──────────
function setBusyGenerating(b = false) {
  busyGen = b;
  el.btnGenerate.disabled = b || busyTts;
  el.btnListen.disabled   = b || busyTts;
  el.btnStop.disabled     = false;
}
function setBusyTts(b = false) {
  busyTts = b;
  el.btnGenerate.disabled = b || busyGen;
  el.btnListen.disabled   = b || busyGen;
  el.btnStop.disabled     = false;
}
function setStatus(text) {
  if (!el.output) return;
  el.output.textContent = text;
}
function appendStatus(line) {
  if (!el.output) return;
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const existing = el.output.textContent || '';
  el.output.textContent = `${existing}\n[${now}] ${line}`.trim();
}
function startDots(label="(genererar") {
  stopDots();
  let i = 0;
  setStatus(`${label}…`);
  dotsTimer = setInterval(() => {
    i = (i + 1) % 6;
    const dots = '.'.repeat(i);
    setStatus(`${label}${dots.padEnd(5, ' ')}`);
  }, 500);
}
function stopDots() {
  if (dotsTimer) {
    clearInterval(dotsTimer);
    dotsTimer = null;
  }
}

function getForm() {
  const minutes = Number(el.length?.value || 5);
  const level   = Number(el.level?.value || 3);
  const voice   = el.voice?.value || 'alloy';
  const tempo   = Number(el.tempo?.value || 1.0);
  const idea    = (el.userIdea?.value || '').trim();
  return { minutes, level, voice, tempo, idea };
}

// ────────── API helpers ──────────
async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/health`);
    const ok = res.ok;
    if (el.apiok) el.apiok.textContent = ok ? 'ok' : 'fail';
    appendStatus(`API: ${ok ? 'ok' : 'fel'}`);
  } catch {
    if (el.apiok) el.apiok.textContent = 'fail';
    appendStatus('API: fel (health)');
  }
}

// Generera berättelse (hela i ett svar)
async function doGenerate() {
  const { idea, level, minutes } = getForm();
  if (!idea) {
    setStatus('(skriv en idé först)');
    return;
  }

  try {
    setBusyGenerating(true);
    startDots('(genererar)');
    appendStatus('Genererar…');

    const res = await fetch(`${BASE}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea, level, minutes })
    });

    stopDots();

    if (!res.ok) {
      const raw = await res.text().catch(()=>'');
      appendStatus(`Fel vid generering: HTTP ${res.status}`);
      setStatus(`(fel vid generering: ${res.status})`);
      console.error('generate error', res.status, raw);
      return;
    }

    const data = await res.json().catch(()=>null);
    if (!data || !data.ok || !data.text) {
      appendStatus('(kunde inte generera – tomt svar)');
      setStatus('(tomt)');
      return;
    }

    // Visa berättelsen
    if (el.story)  el.story.textContent  = data.text;
    setStatus('(klart)');

  } catch (err) {
    stopDots();
    appendStatus(`Fel vid generering: ${err?.message || err}`);
    setStatus('(fel vid generering)');
    console.error(err);
  } finally {
    setBusyGenerating(false);
  }
}

// Text → TTS
async function doTts() {
  const text = el.story?.textContent?.trim();
  if (!text) {
    setStatus('(ingen text att läsa upp)');
    return;
  }
  const { voice, tempo } = getForm();

  try {
    setBusyTts(true);
    appendStatus('Hämtar röst…');

    const res = await fetch(`${BASE}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice })
    });

    if (!res.ok) {
      const raw = await res.text().catch(()=> '');
      appendStatus(`TTS-fel: HTTP ${res.status}`);
      console.error('tts error', res.status, raw);
      return;
    }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);

    if (el.audio) {
      el.audio.playbackRate = Math.max(0.8, Math.min(1.25, tempo || 1.0));
      el.audio.src = url;
      await el.audio.play().catch(()=>{});
    }
    appendStatus('Spelar upp.');

  } catch (err) {
    appendStatus(`TTS-fel: ${err?.message || err}`);
  } finally {
    setBusyTts(false);
  }
}

function stopAudio() {
  try {
    if (el.audio) {
      el.audio.pause();
      el.audio.currentTime = 0;
      appendStatus('Stop.');
    }
  } catch {}
}

// ────────── Events ──────────
function bindEvents() {
  if (el.btnGenerate) el.btnGenerate.addEventListener('click', doGenerate);
  if (el.btnListen)   el.btnListen.addEventListener('click', doTts);
  if (el.btnStop)     el.btnStop.addEventListener('click', stopAudio);
}

// Init
(function init() {
  // snabb sanity: om något saknas, skriv tydligt i output
  const missing = Object.entries(el).filter(([k,v]) => !v && k!=='apiok').map(([k])=>k);
  if (missing.length) {
    console.error('Saknas element i index.html:', missing);
    setStatus(`(fel: saknas element: ${missing.join(', ')})`);
  } else {
    setStatus('(tomt)');
  }
  bindEvents();
  checkHealth();
})();
