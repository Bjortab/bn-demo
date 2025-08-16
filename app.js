<script>
// ====== Ställ in din Cloudflare Pages-bas här ======
const API_BASE = 'https://bn-demo01.pages.dev';
// ===================================================

const els = {
  length: document.getElementById('length'),
  spice: document.getElementById('spice'),
  voice: document.getElementById('voice'),
  words: document.getElementById('words'),
  prompt: document.getElementById('prompt'),
  btnPreview: document.getElementById('btnPreview'),
  btnRead: document.getElementById('btnRead'),
  btnDownload: document.getElementById('btnDownload'),
  status: document.getElementById('status'),
  excerpt: document.getElementById('excerpt'),
  player: document.getElementById('player')
};

function calcWords(mins){ return mins * 170; }

function updateWords(){ els.words.textContent = calcWords(Number(els.length.value)); }
['change','input'].forEach(evt => els.length.addEventListener(evt, updateWords));
updateWords();

function uiStatus(msg='', isError=false) {
  els.status.textContent = msg;
  els.status.style.color = isError ? '#ff7070' : '#9CC6D7';
}

function disableUI(disabled=true){
  els.btnPreview.disabled = disabled;
  els.btnRead.disabled    = disabled;
  els.btnDownload.disabled= disabled;
  els.prompt.disabled     = disabled;
  els.length.disabled     = disabled;
  els.spice.disabled      = disabled;
  els.voice.disabled      = disabled;
}

async function api(path, payload, asBlob=false){
  // Längre timeout (45s) – tidigare 10s gav “Fetch is aborted”.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      // Försök läsa text från server för bättre diagnos
      let text = '';
      try { text = await res.text(); } catch {}
      throw new Error(`HTTP ${res.status} – ${text || 'Request failed'}`);
    }

    return asBlob ? await res.blob() : await res.json();

  } catch (err) {
    clearTimeout(timeout);
    // Tydligare fel för abort
    if (err.name === 'AbortError') {
      throw new Error('Anropet tog för lång tid och avbröts (timeout). Försök igen.');
    }
    throw err;
  }
}

function getPayload(){
  return {
    minutes: Number(els.length.value),
    spice:   Number(els.spice.value),
    voice:   els.voice.value,
    prompt:  (els.prompt.value || '').trim()
  };
}

function setExcerpt(text=''){
  els.excerpt.textContent = text || '';
}

function playBlobAudio(blob){
  const url = URL.createObjectURL(blob);
  els.player.src = url;
  els.player.play().catch(()=>{ /* användaren kan behöva trycka play på iOS */ });
}

async function doPreview(){
  const payload = getPayload();
  if (!payload.prompt) {
    uiStatus('Skriv en idé först.', true); return;
  }

  disableUI(true);
  uiStatus('Genererar text …');

  try {
    const data = await api('/api/generate', payload, false);
    // backend returnerar { text, excerpt }
    setExcerpt(data.excerpt || (data.text || '').slice(0, 300));
    uiStatus('Klar.');
  } catch (e) {
    uiStatus(`Generate failed: ${e.message}`, true);
  } finally {
    disableUI(false);
  }
}

async function doRead(){
  const payload = getPayload();
  if (!payload.prompt) {
    uiStatus('Skriv en idé först.', true); return;
  }

  disableUI(true);
  uiStatus('Skapar berättelse och läser upp …');

  try {
    // 1) Generera text (längre timeout hanteras i api())
    const data = await api('/api/generate', payload, false);
    setExcerpt(data.excerpt || (data.text || '').slice(0, 300));

    // 2) TTS
    uiStatus('Skapar röst …');
    const blob = await api('/api/tts', { text: data.text, voice: payload.voice }, true);
    playBlobAudio(blob);
    uiStatus('Klart – spelar upp.');
  } catch (e) {
    uiStatus(`Generate failed: ${e.message}`, true);
  } finally {
    disableUI(false);
  }
}

async function doDownloadTxt(){
  const payload = getPayload();
  if (!payload.prompt) {
    uiStatus('Skriv en idé först.', true); return;
  }
  disableUI(true);
  uiStatus('Genererar text …');

  try {
    const data = await api('/api/generate', payload, false);
    const blob = new Blob([data.text || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'blush_narrative.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    uiStatus('Text nedladdad.');
  } catch (e) {
    uiStatus(`Download failed: ${e.message}`, true);
  } finally {
    disableUI(false);
  }
}

els.btnPreview?.addEventListener('click', doPreview);
els.btnRead?.addEventListener('click', doRead);
els.btnDownload?.addEventListener('click', doDownloadTxt);

// Startstatus
uiStatus('');
setExcerpt('');

</script>
