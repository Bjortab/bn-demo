// app.js – frontend-logik med röstval och direktuppspelning

const els = {
  idea:       document.querySelector('#ideaInput'),
  minutes:    document.querySelector('#minutesSelect'),
  spice:      document.querySelector('#spiceRange'),
  voice:      document.querySelector('#voiceSelect'),
  createBtn:  document.querySelector('#createBtn'),
  stopBtn:    document.querySelector('#stopBtn'),
  storyBox:   document.querySelector('#storyText'),
  audio:      document.querySelector('#audioPlayer'),
  status:     document.querySelector('#statusText'),
  copyBtn:    document.querySelector('#copyBtn'),
  dlTxtBtn:   document.querySelector('#downloadTxtBtn'),
};

let abortCtrl = null;

// minne – läs senaste inställningar
restorePrefs();

// event
els.createBtn?.addEventListener('click', onCreate);
els.stopBtn?.addEventListener('click', onStop);
els.copyBtn?.addEventListener('click', copyText);
els.dlTxtBtn?.addEventListener('click', downloadTxt);
['minutes', 'spice', 'voice'].forEach(k => els[k]?.addEventListener('change', savePrefs));

async function onCreate() {
  const prompt  = (els.idea?.value || '').trim();
  const minutes = Number(els.minutes?.value || 5);
  const spice   = Number(els.spice?.value || 3);
  const voice   = String(els.voice?.value || 'alloy').toLowerCase();

  if (!prompt) return toast('Skriv en idé först.');

  abortCtrl = new AbortController();
  lockUI(true, 'Skapar berättelse…');

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, minutes, spice, voice }),
      signal: abortCtrl.signal
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.error || `Fel ${res.status}`);

    els.storyBox.textContent = data.text || '(tomt svar)';
    if (data.audio) {
      els.audio.src = data.audio;
      try { await els.audio.play(); } catch {}
      toast(`Klar – röst: ${data.voice || voice}`);
    } else {
      toast('Klar. (Ingen TTS, endast text.)');
    }
  } catch (err) {
    if (err.name === 'AbortError') toast('Avbrutet.');
    else {
      console.error(err);
      toast(err.message || 'Ett fel uppstod.');
    }
  } finally {
    lockUI(false);
    abortCtrl = null;
  }
}

function onStop() {
  if (abortCtrl) abortCtrl.abort();
}

function copyText() {
  const t = els.storyBox?.textContent || '';
  if (!t) return toast('Ingen text att kopiera.');
  navigator.clipboard.writeText(t).then(() => toast('Text kopierad.'));
}

function downloadTxt() {
  const t = els.storyBox?.textContent || '';
  if (!t) return toast('Ingen text att ladda ner.');
  const blob = new Blob([t], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'berattelse.txt';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function toast(msg) { if (els.status) els.status.textContent = msg; }
function lockUI(lock, msg) {
  if (els.createBtn) els.createBtn.disabled = lock;
  if (els.stopBtn)   els.stopBtn.disabled   = !lock;
  if (els.status)    els.status.textContent = lock ? (msg || 'Arbetar…') : '';
}

function savePrefs() {
  const prefs = {
    minutes: els.minutes?.value || '5',
    spice:   els.spice?.value || '3',
    voice:   els.voice?.value || 'alloy'
  };
  localStorage.setItem('bn_prefs', JSON.stringify(prefs));
}
function restorePrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('bn_prefs') || '{}');
    if (p.minutes && els.minutes) els.minutes.value = p.minutes;
    if (p.spice   && els.spice)   els.spice.value   = p.spice;
    if (p.voice   && els.voice)   els.voice.value   = p.voice;
  } catch {}
}
