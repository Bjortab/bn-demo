// app.js v1.5.4 – stabil klient som pratar med worker v1.5+
// Endpoints i worker: /api/v1/status, /session (POST), /characters/create, /arcs/start, /episodes/generate, /episodes/by-character

const API = 'https://bn-worker.bjorta-bb.workers.dev/api/v1';

const state = {
  user_id: null,
  token: null,
  character_id: null,
  arc_id: null,
  level: 2,
  provider: '…',
  mock: true,
  version: '…',
};

const LEVEL_TEXT = {
  1: 'Romantisk, bara stämning.',
  2: 'Antydande, sensuellt, beröring & metaforer. Inga könsord.',
  3: 'Sensuellt, lite mer kropp, försiktigt vokabulär.',
  4: 'Explicit men inom gränserna.',
  5: 'Direkt & rakt, tillåter grova fraser inom lagens ramar.'
};

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);

function setError(msg) {
  $('err').textContent = msg || '';
}
function setResult(obj) {
  $('result').value = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
}
function setEpisodes(list) {
  if (!list?.items?.length) {
    $('episodes').textContent = '— inga avsnitt —';
    return;
  }
  const lines = list.items.map((e, i) => {
    const t = (e.created_at || '').toString().replace('T',' ').replace('Z','');
    return `#${i+1} • ${t}\n${e.story}\n[SLUT]\n`;
  }).join('\n');
  $('episodes').textContent = lines;
}

async function safeFetch(url, init = {}) {
  setError('');
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* keep as text */ }

    if (!res.ok) {
      // worker returnerar {error:"..."} vid 404 mm
      const msg = json?.error || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return json ?? {};
  } catch (err) {
    setError(`Error: ${err.message}`);
    throw err;
  }
}

function setLevelUI(lvl) {
  state.level = lvl;
  const wrap = $('levels');
  wrap.innerHTML = '';
  [1,2,3,4,5].forEach(n => {
    const b = document.createElement('button');
    b.className = 'level-btn' + (n===lvl ? ' active':'');
    b.textContent = String(n);
    b.onclick = () => setLevelUI(n);
    wrap.appendChild(b);
  });
  $('levelHint').textContent = `${lvl} – ${LEVEL_TEXT[lvl]}`;
}

function updateChips() {
  $('chip-worker').textContent = `worker v${state.version || '?'}`;
  $('chip-prov').textContent = `provider ${state.provider}`;
  $('chip-mock').textContent = `mock: ${state.mock ? 'ON' : 'OFF'}`;
  $('chip-session').textContent = state.user_id ? `session: ${state.user_id.slice(0,8)}…` : 'ingen session';
  $('apiLabel').textContent = API;
}

// ---------- boot ----------
(async function boot(){
  setLevelUI(2);
  updateChips();

  // Hämta status
  try {
    const status = await safeFetch(`${API}/status`, { method: 'GET' });
    state.version  = status?.version || state.version;
    state.mock     = !!status?.flags?.MOCK;
    // försök hitta vald provider
    const prov = (status?.lm || []).find(p => p.healthy !== undefined);
    state.provider = status?.provider || prov?.name || state.provider;
  } catch {/* visad redan */}
  updateChips();
})();

// ---------- UI handlers ----------
$('btnSession').onclick = async () => {
  try {
    const data = await safeFetch(`${API}/session`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({}) // anonym
    });
    state.user_id = data.user_id;
    state.token = data.token;
    updateChips();
    setResult({ ok:true, session:data });
  } catch {/* fel visas av safeFetch */}
};

$('btnCreateChar').onclick = async () => {
  if (!state.user_id) { setError('Skapa session först.'); return; }
  const name = $('charName').value.trim() || 'Mia';
  try {
    const data = await safeFetch(`${API}/characters/create`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ user_id: state.user_id, name })
    });
    state.character_id = data.character_id;
    setResult({ ok:true, character:data });
  } catch {}
};

$('btnStartArc').onclick = async () => {
  if (!state.user_id || !state.character_id) { setError('Skapa session och karaktär först.'); return; }
  const title = $('arcTitle').value.trim() || 'Första mötet';
  try {
    const data = await safeFetch(`${API}/arcs/start`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ user_id: state.user_id, character_id: state.character_id, title })
    });
    state.arc_id = data.arc_id;
    setResult({ ok:true, arc:data });
  } catch {}
};

$('btnGenerate').onclick = async () => {
  if (!state.user_id || !state.character_id || !state.arc_id) {
    setError('Skapa session, karaktär och starta arc först.');
    return;
  }
  const prompt = $('prompt').value.trim() || 'vi möttes på tåget…';
  const lang = $('lang').value || 'sv';
  const words = parseInt($('words').value || '180', 10);

  try {
    const ep = await safeFetch(`${API}/episodes/generate`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({
        user_id: state.user_id,
        character_id: state.character_id,
        arc_id: state.arc_id,
        prompt, level: state.level, lang, words
      })
    });
    setResult(ep);
  } catch {}
};

$('btnList').onclick = async () => {
  if (!state.user_id || !state.character_id) { setError('Skapa session och karaktär först.'); return; }
  try {
    const list = await safeFetch(`${API}/episodes/by-character`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ user_id: state.user_id, character_id: state.character_id, limit: 10 })
    });
    setEpisodes(list);
  } catch {}
};

$('btnFeedback').onclick = () => {
  alert('Tack! Feedbackknappen är plats­hållare i demot.');
};
