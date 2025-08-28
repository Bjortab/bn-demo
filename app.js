// app.js — Golden Copy v1.3.2 (CF Pages, robust JSON/content-type guards)

const $ = (q) => document.querySelector(q);

// UI
const elLevel     = $('#level');
const elLength    = $('#length');
const elVoice     = $('#voice');
const elTempo     = $('#tempo');
const elIdea      = $('#userIdea');
const btnGen      = $('#generateBtn');
const btnListen   = $('#listenBtn');
const btnStop     = $('#stopBtn');
const out         = $('#output');
const player      = $('#audio');

// API base (Pages Functions)
const BASE = location.origin + '/api';

let busyTTS = false;
let busyGen = false;

function setBusy(kind, v) {
  if (kind === 'gen') busyGen = v;
  if (kind === 'tts') busyTTS = v;
  btnGen.disabled    = busyGen || busyTTS;
  btnListen.disabled = busyGen || busyTTS;
  btnStop.disabled   = busyGen && !busyTTS ? false : busyTTS;
}

function setStatus(text) {
  out.textContent = text;
}

function appendStatus(line) {
  const now = new Date().toLocaleTimeString();
  out.textContent = `${out.textContent}\n[${now}] ${line}`.trim();
}

async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/health`);
    const ok  = res.ok;
    const json = ok ? await res.json().catch(() => ({})) : {};
    console.log('[BN] /health', ok, json);
    appendStatus(ok ? 'API: ok' : 'API: fel');
  } catch (e) {
    console.log('[BN] /health error', e);
    appendStatus('API: fel');
  }
}

checkHealth();

// helpers
function getLevel()  { return Number(elLevel?.value || 3); }
function getMinutes(){ return Number(elLength?.value || 5); }

function buildPrompt(idea, level, minutes) {
  const guide =
    'Skriv en sammanhängande berättelse (svenska) i jag-form eller nära tredjeperson. ' +
    'Håll en naturlig röst och undvik upprepningar. Integrera idén organiskt.';

  const targetlen = Math.max(600, Math.round(minutes * 1600)); // ~1600 tecken/minut (kan justeras)

  return [
    `Mål-längd: cirka ${targetlen} tecken.`,
    `Nivå: ${level} (1 snäll … 5 explicit).`,
    `Idé: ${idea || 'ingen idé — bygg en mjuk start, stegring, avtoning.'}`,
    guide
  ].join('\n');
}

function withTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(new Error('timeout')), ms);
  return { signal: c.signal, cancel: () => clearTimeout(t) };
}

async function generate() {
  const idea    = (elIdea?.value || '').trim();
  const level   = getLevel();
  const minutes = getMinutes();

  setBusy('gen', true);
  setStatus('(genererar …)');

  // Request
  const body = JSON.stringify({ idea, level, minutes });
  console.log('[BN] POST /generate body', body);

  const { signal, cancel } = withTimeout(90000); // 90s
  let res, raw, ct;

  try {
    res = await fetch(`${BASE}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal
    });
  } catch (e) {
    cancel();
    console.log('[BN] fetch /generate error', e);
    setBusy('gen', false);
    appendStatus('(fel vid generering — nätverk/timeout)');
    return;
  }

  try {
    ct  = res.headers.get('content-type') || '';
    raw = await res.text(); // alltid text först, sen ev JSON-parse
    console.log('[BN] /generate status', res.status, 'ct', ct, 'raw(head)', raw.slice(0,180));

    if (!res.ok) {
      // Visa serverfeltext om den inte är JSON
      if (!ct.includes('application/json')) {
        setStatus(`(serverfel ${res.status})\n${raw.slice(0,800)}`);
      } else {
        let j;
        try { j = JSON.parse(raw); } catch {}
        setStatus(`(fel vid generering)\nstatus=${res.status}\n${j ? JSON.stringify(j) : raw}`);
      }
      setBusy('gen', false);
      return;
    }

    // OK → förvänta JSON
    if (!ct.includes('application/json')) {
      setStatus(`(oväntat svar — ej JSON)\nct=${ct}\n${raw.slice(0,800)}`);
      setBusy('gen', false);
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      setStatus(`(ogiltig JSON från servern)\n${raw.slice(0,800)}`);
      setBusy('gen', false);
      return;
    }

    // Stabil JSON-access
    let story = '';
    if (data.story) story = data.story;
    else if (data.output && Array.isArray(data.output) && data.output[0]?.content?.[0]?.text) {
      story = data.output[0].content[0].text;
    } else if (data.text) story = data.text;

    if (!story) {
      setStatus('(kunde inte generera — tomt svar)');
      setBusy('gen', false);
      return;
    }

    setStatus(story);
  } catch (e) {
    console.log('[BN] parse/handle error', e);
    setStatus('(fel vid generering — hantering)');
  } finally {
    cancel();
    setBusy('gen', false);
  }
}

async function listen() {
  const text  = out?.textContent?.trim() || '';
  if (!text) { appendStatus('(ingen text att lyssna på)'); return; }

  setBusy('tts', true);
  appendStatus('Hämtar röst …');

  const { signal, cancel } = withTimeout(60000);
  let res;
  try {
    res = await fetch(`${BASE}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice: elVoice?.value || 'alloy', speed: Number(elTempo?.value || 1.0) }),
      signal
    });
  } catch (e) {
    cancel();
    setBusy('tts', false);
    appendStatus('(röstfel — nätverk/timeout)');
    return;
  }

  try {
    if (!res.ok) {
      const raw = await res.text().catch(()=>'');
      console.log('[BN] /tts fail', res.status, raw.slice(0,180));
      appendStatus(`(röstfel ${res.status})`);
      return;
    }
    const blob = await res.blob();
    player.src = URL.createObjectURL(blob);
    await player.play().catch(()=>{});
    appendStatus('Spelar upp …');
  } catch (e) {
    console.log('[BN] tts handle error', e);
    appendStatus('(röstfel — hantering)');
  } finally {
    cancel();
    setBusy('tts', false);
  }
}

function stopAudio() {
  try { player.pause(); player.currentTime = 0; } catch {}
}

// bind UI
btnGen?.addEventListener('click', generate);
btnListen?.addEventListener('click', listen);
btnStop?.addEventListener('click', stopAudio);

// starttext
setStatus('(tomt)');
