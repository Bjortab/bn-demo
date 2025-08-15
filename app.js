// app.js
const els = {
  length: document.getElementById('length'),
  spice: document.getElementById('spice'),
  voice: document.getElementById('voice'),
  wordsHint: document.getElementById('wordsHint'),
  prompt: document.getElementById('prompt'),
  btnPreview: document.getElementById('btnPreview'),
  btnSpeak: document.getElementById('btnSpeak'),
  btnDownload: document.getElementById('btnDownload'),
  btnSaveFav: document.getElementById('btnSaveFav'),
  status: document.getElementById('status'),
  player: document.getElementById('player'),
  excerpt: document.getElementById('excerpt'),
};

function calcWords(minutes) {
  return minutes * 170;
}
function setStatus(msg, cls='') {
  els.status.className = `status ${cls}`;
  els.status.textContent = msg;
}
function getPayload() {
  return {
    prompt: (els.prompt.value || '').trim(),
    minutes: Number(els.length.value),
    spice: Number(els.spice.value),
    voice: els.voice.value
  };
}

function updateHints() {
  els.wordsHint.textContent = calcWords(Number(els.length.value));
}
els.length.addEventListener('change', updateHints);
updateHints();

async function callGenerate(payload) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Generate failed: ${res.status}`);
  return res.json(); // { text, excerpt }
}

async function callTTS(payload) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
  // API returnerar audio/mpeg stream; anta att din tts-funktion svarar med base64 eller blob-redirect
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

els.btnPreview.addEventListener('click', async () => {
  const p = getPayload();
  if (!p.prompt) {
    setStatus('Skriv en idé först.', 'err');
    return;
  }
  try {
    setStatus('Genererar text…');
    const out = await callGenerate(p);
    els.excerpt.textContent = (out.excerpt || out.text || '').slice(0, 800);
    setStatus('Klar (text).', 'ok');
  } catch (e) {
    console.error(e);
    setStatus(e.message, 'err');
  }
});

els.btnSpeak.addEventListener('click', async () => {
  const p = getPayload();
  if (!p.prompt) {
    setStatus('Skriv en idé först.', 'err');
    return;
  }
  try {
    setStatus('Genererar text…');
    const out = await callGenerate(p);

    // Visa utdrag
    els.excerpt.textContent = (out.excerpt || out.text || '').slice(0, 800);
    setStatus('Skapar tal…');

    // Skicka texten till TTS
    const audioUrl = await callTTS({
      text: out.text || out.excerpt || '',
      voice: p.voice
    });

    els.player.src = audioUrl;
    els.player.play().catch(()=>{ /* autoplay block, ok */ });
    setStatus('Spelar upp.', 'ok');
  } catch (e) {
    console.error(e);
    setStatus(e.message, 'err');
  }
});

els.btnDownload.addEventListener('click', async () => {
  const p = getPayload();
  if (!p.prompt) { setStatus('Skriv en idé först.', 'err'); return; }
  try {
    setStatus('Genererar text för nedladdning…');
    const out = await callGenerate(p);
    const blob = new Blob([out.text || out.excerpt || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'berattelse.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus('Text nedladdad.', 'ok');
  } catch (e) {
    setStatus(e.message, 'err');
  }
});

els.btnSaveFav.addEventListener('click', () => {
  setStatus('Favoriter kommer snart ✨', 'ok');
});
