// app.js – GC v1.3.2 (Cloudflare)

const $ = (q) => document.querySelector(q);

// UI
const out = $('#output');
const btnGen = $('#generateBtn');
const btnPlay = $('#listenBtn');
const btnStop = $('#stopBtn');
const ideaEl = $('#userIdea');
const levelEl = $('#level');
const minutesEl = $('#length');
const voiceEl = $('#voice');
const tempoEl = $('#tempo');
const audioEl = $('#audio');

let busyGen = false;

function setBusy(b=false) {
  busyGen = b;
  btnGen.disabled = b;
  btnPlay.disabled = b;
}

function log(line) {
  const now = new Date().toLocaleTimeString();
  out.textContent += `\n[${now}] ${line}`;
}

function resetOut() {
  out.textContent = '(tomt)';
}

async function generate() {
  if (busyGen) return;
  resetOut();
  setBusy(true);
  log('Genererar…');

  const payload = {
    idea: ideaEl.value?.trim(),
    level: Number(levelEl.value),
    minutes: Number(minutesEl.value),
  };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort('client_timeout'), 65000); // klient 65s

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    clearTimeout(t);

    if (!res.ok) {
      const txt = await res.text().catch(()=>'');
      log(`Fel vid generering: HTTP ${res.status}`);
      if (txt) log(txt.slice(0, 400));
      return;
    }

    const data = await res.json().catch(()=> ({}));
    if (!data?.ok || !data?.text) {
      log('Fel vid generering: tomt svar');
      return;
    }

    // visa provider + text
    log(`provider: ${data.provider || 'mistral'}`);
    out.textContent += `\n\n${data.text}\n\n(klart)`;

    // auto-TTS
    await speak(data.text);
  } catch (e) {
    log(`Fel (klient): ${e}`);
  } finally {
    setBusy(false);
  }
}

async function speak(text) {
  try {
    log('Väntar röst…');
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice: voiceEl.value, tempo: Number(tempoEl.value) }),
    });
    if (!res.ok) {
      log(`TTS-fel: ${res.status}`);
      return;
    }
    const buf = await res.arrayBuffer();
    const blob = new Blob([buf], { type: 'audio/mpeg' });
    audioEl.src = URL.createObjectURL(blob);
    audioEl.play().catch(()=>{});
  } catch (e) {
    log(`TTS-fel: ${e}`);
  }
}

btnGen?.addEventListener('click', generate);
btnPlay?.addEventListener('click', () => {
  if (audioEl.src) audioEl.play().catch(()=>{});
});
btnStop?.addEventListener('click', () => audioEl.pause());
