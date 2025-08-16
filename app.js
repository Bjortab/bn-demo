// app.js – mobilvänligare TTS: längre timeout + retry och kort förhandslyssning

// ======= Ställ in din Cloudflare Pages-bas här =======
const API_BASE = 'https://bn-demo01.pages.dev'; // din Pages-domän
// =====================================================

const els = {
  spiceBtns: Array.from(document.querySelectorAll('[data-spice]')),
  voice: document.getElementById('voice'),
  idea: document.getElementById('idea'),
  btnPreview: document.getElementById('btnPreview'),
  btnRead: document.getElementById('btnRead'),
  btnDownload: document.getElementById('btnDownload'),
  status: document.getElementById('status'),
  excerpt: document.getElementById('excerpt'),
  player: document.getElementById('player'),
};

let currentSpice = 2; // default

// Markera vald snusk-nivå (knapparna 1..5)
els.spiceBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    els.spiceBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSpice = Number(btn.dataset.spice || 2);
  });
});

// UI-status
function uiStatus(msg = '', isError = false) {
  if (!els.status) return;
  els.status.textContent = msg || '';
  els.status.style.color = isError ? '#ff7070' : '#9CC6D7';
}

// Fetch med abort-timeout + retry
async function fetchJsonWithTimeout(url, opts, timeoutMs, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(t);
      return r;
    } catch (e) {
      clearTimeout(t);
      const isAbort = (e?.name === 'AbortError') || /aborted/i.test(String(e));
      if (isAbort && attempt < retries) {
        await sleep(500); // backoff
        continue;
      }
      throw e;
    }
  }
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const TIMEOUT_GENERATE = isMobile ? 45000 : 90000; // text
const TIMEOUT_TTS_PREVIEW = isMobile ? 30000 : 45000;
const TIMEOUT_TTS_FULL = isMobile ? 60000 : 90000;

// Anropa backend
async function api(path, payload, { previewTTS = false } = {}) {
  const url = `${API_BASE}${path}`;
  const timeout = path.endsWith('/generate')
    ? TIMEOUT_GENERATE
    : previewTTS
      ? TIMEOUT_TTS_PREVIEW
      : TIMEOUT_TTS_FULL;

  const res = await fetchJsonWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  }, timeout, /*retries*/ 1);

  return res;
}

// Läs upp (med TTS)
async function readOut(preview = false) {
  try {
    uiStatus(preview ? 'Genererar kort provlyssning…' : 'Genererar berättelse och ljud…');

    const idea = (els.idea?.value || '').trim();
    const voice = els.voice?.value || 'alloy';
    const spice = currentSpice;

    // 1) GENERERA TEXT
    const gRes = await api('/api/generate', { idea, spice });
    if (!gRes.ok) {
      const err = await safeJson(gRes);
      throw new Error(`Textgenerering misslyckades (${gRes.status}): ${shortErr(err)}`);
    }
    const gJson = await gRes.json();
    const fullText = (gJson?.story || '').trim();
    const excerpt = (gJson?.excerpt || '').trim();

    if (!fullText) {
      throw new Error('Textgenereringen gav tomt svar. Försök igen med en annan formulering.');
    }

    // Visa utdrag alltid
    if (els.excerpt) els.excerpt.textContent = excerpt || fullText.slice(0, 280) + '…';

    // 2) TTS
    const tRes = await api('/api/tts', { text: fullText, voice, preview }, { previewTTS: preview });
    if (!tRes.ok) {
      const err = await safeJson(tRes);
      throw new Error(`OpenAI TTS error: ${shortErr(err)} (status ${tRes.status})`);
    }
    const audioBuf = await tRes.arrayBuffer();

    // 3) Spela upp
    const blob = new Blob([audioBuf], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    els.player.src = url;
    els.player.play().catch(()=>{ /* användaren kan behöva trycka play */ });

    uiStatus('');
  } catch (e) {
    uiStatus(`Generate failed: ${String(e.message || e)}`, true);
  }
}

function shortErr(e) {
  try {
    if (!e) return '';
    if (typeof e === 'string') return e.slice(0, 200);
    if (e.error) {
      const msg = e.error.message || e.error.reason || JSON.stringify(e.error).slice(0, 200);
      return msg;
    }
    return JSON.stringify(e).slice(0, 200);
  } catch {
    return '';
  }
}

async function safeJson(r) {
  try { return await r.json(); } catch { return {}; }
}

// Event-handlers
els.btnPreview?.addEventListener('click', () => readOut(true));
els.btnRead?.addEventListener('click', () => readOut(false));

// Ladda ner texten (senaste texten visas i utdraget; här kan du koppla till backend om du vill)
els.btnDownload?.addEventListener('click', () => {
  const txt = els.excerpt?.textContent || '';
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'berattelse.txt'; a.click();
  URL.revokeObjectURL(url);
});
