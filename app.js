<script>
// ================== Robust frontend för BN ==================
const API_BASE = location.origin; // funkar både på pages.dev och github.io

// Hjälpare: hitta ett element via flera kandidater
function findEl(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// Samla referenser – TÅL saknade element
const els = {
  minutes:  findEl(['#length', 'select[name="length"]', '[data-length]']),
  levelRadios: document.querySelectorAll('input[name="level"]'),
  levelButtonsWrap: findEl(['.snusk', '#snusk', '[data-snusk]']),
  voice:    findEl(['#voice', 'select[name="voice"]']),
  idea:     findEl(['#idea', '#user-idea', '#prompt', 'textarea[name="idea"]', 'input[name="idea"]', '.idea-input']),
  btnPreview: findEl(['#btnPreview', 'button[data-action="preview"]']),
  btnRead:    findEl(['#btnRead', 'button[data-action="read"]', '#btnGenerate']),
  btnDownload:findEl(['#btnDownload', 'button[data-action="download"]']),
  status:   findEl(['#status', '.status']),
  excerpt:  findEl(['#excerpt', '.excerpt']),
  player:   findEl(['#player', 'audio'])
};

// Säkert värde från input/textarea
function getInputValue(el) {
  if (!el) return '';
  if ('value' in el) return String(el.value).trim();
  return '';
}

function getMinutes() {
  // default 5 om inget hittas
  const raw = els.minutes && ('value' in els.minutes) ? els.minutes.value : '5';
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function getLevel() {
  // 1) radioknappar (om finns)
  if (els.levelRadios && els.levelRadios.length) {
    const checked = Array.from(els.levelRadios).find(r => r.checked);
    if (checked && checked.value) return Number(checked.value);
  }
  // 2) aktiva knappar (om du kör knappar med .active och data-level)
  if (els.levelButtonsWrap) {
    const activeBtn = els.levelButtonsWrap.querySelector('[data-level].active');
    if (activeBtn) return Number(activeBtn.getAttribute('data-level'));
  }
  // fallback
  return 2;
}

function uiStatus(msg, isError = false) {
  if (!els.status) return;
  els.status.textContent = msg;
  els.status.style.color = isError ? '#ef7070' : '#9c6d7b';
}

function setExcerpt(text) {
  if (!els.excerpt) return;
  els.excerpt.textContent = text || '';
}

function setAudioBlob(blob) {
  if (!els.player) return;
  try {
    const url = URL.createObjectURL(blob);
    els.player.src = url;
    els.player.load();
  } catch {}
}

// API-call wrapper
async function apiPost(path, payload, asBlob = false, signal) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error(`${res.status} :: ${txt || res.statusText}`);
  }
  return asBlob ? res.blob() : res.json();
}

// Huvudflöde
async function handleGenerate({ previewOnly = false } = {}) {
  const controller = new AbortController();
  const signal = controller.signal;

  const idea = getInputValue(els.idea);
  const minutes = getMinutes();
  const level = getLevel();
  const voice = getInputValue(els.voice) || 'alloy';

  if (!idea) {
    uiStatus('Skriv en idé i fältet först.', true);
    return;
  }

  // 1) hämta text
  try {
    uiStatus('Genererar text …');
    const gen = await apiPost('/api/generate', { idea, minutes, level }, false, signal);
    const { text, excerpt } = gen || {};
    if (!text) throw new Error('Tomt svar från textgenerering.');

    setExcerpt(excerpt || (text.slice(0, 300) + ' …'));

    if (previewOnly) {
      uiStatus('Förhandsvisning klar. Tryck "Läs upp" för audio.');
      return;
    }

    // 2) TTS
    uiStatus('Skapar ljud …');
    const wavBlob = await apiPost('/api/tts', { text, voice }, true, signal);
    setAudioBlob(wavBlob);
    uiStatus('Klart!');
  } catch (err) {
    console.error(err);
    uiStatus(`Generate failed: ${err.message || err}`, true);
  }
}

// Event-koppling (tål att knappar saknas)
els.btnPreview && els.btnPreview.addEventListener('click', () => handleGenerate({ previewOnly: true }));
els.btnRead    && els.btnRead.addEventListener('click',   () => handleGenerate({ previewOnly: false }));

// Ladda ner-knapp (om du vill spara texten du ser i utdraget)
els.btnDownload && els.btnDownload.addEventListener('click', () => {
  const text = els.excerpt ? els.excerpt.textContent : '';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'blush-narratives.txt';
  a.click();
  URL.revokeObjectURL(a.href);
});
</script>
