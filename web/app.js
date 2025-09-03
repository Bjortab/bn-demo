(() => {
  // ====== KONFIG ======
  // Byt vid behov till din worker-url (utan trailing slash)
  const API_BASE = 'https://bn-worker.bjorta-bb.workers.dev';
  const API = `${API_BASE}/api/v1`;

  // Hjälpfunktion: fetcha JSON med standardheaders
  async function jfetch(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText || 'Request failed';
      throw new Error(`${res.status} ${msg}`);
    }
    return data;
  }

  // ====== STATE ======
  const state = {
    session: null,     // { user_id, token, created }
    character: null,   // { character_id, name }
    arc: null,         // { arc_id, name, next_step }
    lastEpisode: null, // { ... }
    status: null       // /status payload
  };

  // ====== API WRAPPERS ======
  async function getStatus() {
    const s = await jfetch('/status');
    state.status = s;
    return s;
  }

  async function createSession() {
    const s = await jfetch('/session', { method: 'POST' });
    state.session = s;
    return s;
  }

  async function createCharacter(name = 'Nadja') {
    ensureSession();
    const out = await jfetch('/characters/create', {
      method: 'POST',
      body: { user_id: state.session.user_id, name }
    });
    state.character = out;
    return out;
  }

  async function startArc(title = 'Första mötet') {
    ensureSession();
    ensureCharacter();
    const out = await jfetch('/arcs/start', {
      method: 'POST',
      body: {
        user_id: state.session.user_id,
        character_id: state.character.character_id,
        title
      }
    });
    state.arc = out;
    return out;
  }

  async function generateEpisode({ prompt, level, lang, words, make_audio = false }) {
    ensureSession();
    ensureCharacter();
    ensureArc();

    const body = {
      user_id: state.session.user_id,
      character_id: state.character.character_id,
      arc_id: state.arc.arc_id,
      prompt,
      level: Number(level) || 2,
      lang: (lang || 'sv').toLowerCase(),
      words: Number(words) || 180,
      make_audio: !!make_audio
    };

    const ep = await jfetch('/episodes/generate', { method: 'POST', body });
    state.lastEpisode = ep;
    return ep;
  }

  async function listEpisodes(limit = 20) {
    ensureSession();
    ensureCharacter();
    const out = await jfetch('/episodes/by-character', {
      method: 'POST',
      body: { user_id: state.session.user_id, character_id: state.character.character_id, limit: Number(limit) }
    });
    return out;
  }

  // ====== GUARD HELPERS ======
  function ensureSession() {
    if (!state.session?.user_id) throw new Error('Ingen session. Klicka "Skapa anonym session" först.');
  }
  function ensureCharacter() {
    if (!state.character?.character_id) throw new Error('Ingen karaktär. Klicka "Skapa karaktär" först.');
  }
  function ensureArc() {
    if (!state.arc?.arc_id) throw new Error('Ingen story-arc. Klicka "Starta arc" först.');
  }

  // ====== UI BINDINGS (robust mot olika html) ======
  function q(id) { return document.getElementById(id); }
  function text(el, t) { if (el) el.textContent = t; }

  function bindButton(id, handler) {
    const el = q(id);
    if (!el) return;
    el.addEventListener('click', async () => {
      try {
        el.disabled = true;
        await handler(el);
      } catch (err) {
        alert(err.message || String(err));
        console.error(err);
      } finally {
        el.disabled = false;
      }
    });
  }

  function currentLevel() {
    // Stöd både <input type=range id="level"> och radios [name="level"]
    const range = q('level');
    if (range && range.value) return Number(range.value);
    const picked = document.querySelector('input[name="level"]:checked');
    return picked ? Number(picked.value) : 2;
  }

  function currentLang() {
    const sel = q('lang');
    return sel && sel.value ? sel.value : 'sv';
  }

  function currentWords() {
    const sel = q('words');
    if (sel && sel.value) return Number(sel.value);
    // fallback: input number
    const num = q('wordsNum');
    return num && num.value ? Number(num.value) : 180;
  }

  function currentPrompt() {
    const ta = q('prompt');
    return (ta && ta.value.trim()) || '';
  }

  function setBadge(status) {
    const el = q('statusBadge');
    if (!el) return;
    const v = status?.version || 'v?';
    const m = status?.flags?.MOCK ? 'mock' : 'live';
    const prov = status?.flags?.PROVIDER || '—';
    text(el, `worker ${v} (${m}, ${prov})`);
  }

  function showEpisode(ep) {
    // Försök skriva in i element med id "result" + "summary" om de finns
    const resBox = q('result');
    const sumBox = q('summary');
    if (resBox) {
      const body = ep?.story || ep?.body || ep?.episode?.story || '(tomt)';
      resBox.textContent = body;
    }
    if (sumBox) {
      const sum = ep?.summary || ep?.episode?.summary || '';
      sumBox.textContent = sum;
    }
  }

  function showEpisodesList(list) {
    const listBox = q('episodesList');
    if (!listBox) return;
    const items = Array.isArray(list?.items) ? list.items : [];
    listBox.innerHTML = items.map((it, i) => {
      const t = (it?.story || '').slice(0, 120).replace(/\n/g, ' ');
      return `<li>#${i + 1}: ${t}${t.length >= 120 ? '…' : ''}</li>`;
    }).join('') || '<li>(inga avsnitt ännu)</li>';
  }

  // ====== INIT ======
  document.addEventListener('DOMContentLoaded', async () => {
    // Visa status-badge
    try {
      const s = await getStatus();
      setBadge(s);
      console.log('STATUS:', s);
    } catch (err) {
      console.warn('Kunde inte läsa /status:', err);
    }

    // Bind knappar om de finns i din HTML
    bindButton('btnSession', async () => {
      const s = await createSession();
      alert('Anonym session skapad.');
      console.log('SESSION:', s);
    });

    bindButton('btnCreateChar', async () => {
      const nameEl = q('charName');
      const name = (nameEl && nameEl.value.trim()) || 'Nadja';
      const out = await createCharacter(name);
      alert(`Karaktär skapad: ${out?.name || name}`);
      console.log('CHAR:', out);
    });

    bindButton('btnStartArc', async () => {
      const titleEl = q('arcTitle');
      const title = (titleEl && titleEl.value.trim()) || 'Första mötet';
      const out = await startArc(title);
      alert(`Arc startad: ${out?.name || title}`);
      console.log('ARC:', out);
    });

    bindButton('btnGenerate', async () => {
      const ep = await generateEpisode({
        prompt: currentPrompt(),
        level: currentLevel(),
        lang: currentLang(),
        words: currentWords(),
        make_audio: !!(q('makeAudio') && q('makeAudio').checked),
      });
      console.log('NEW EPISODE:', ep);
      showEpisode(ep);

      // uppdatera lista (om knapp/box finns)
      try {
        const list = await listEpisodes(20);
        showEpisodesList(list);
      } catch (e) { /* no-op */ }
    });

    bindButton('btnList', async () => {
      const list = await listEpisodes(20);
      console.log('ALL EPISODES:', list);
      showEpisodesList(list);
    });

    // Exponera i devtools för snabbtest
    window.bn = {
      API_BASE, API, state,
      getStatus, createSession, createCharacter, startArc, generateEpisode, listEpisodes
    };
    console.log('bn ready → window.bn', window.bn);
  });
})();
