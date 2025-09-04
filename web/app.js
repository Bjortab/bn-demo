// web/app.js — BN front v1.5.4 (golden)
// Robust init, inga dubbletter av variabler, enkel UI-tråd mot worker.

(() => {
  const API = "https://bn-worker.bjorta-bb.workers.dev/api/v1";

  // DOM refs
  const $sessionBtn = qs("#btnSession");
  const $charName = qs("#charName");
  const $charBtn = qs("#btnCreateChar");
  const $arcBtn = qs("#btnStartArc");
  const $levelRadios = qsa('input[name="level"]');
  const $langSel = qs("#lang");
  const $wordsSel = qs("#words");
  const $prompt = qs("#prompt");
  const $genBtn = qs("#btnGenerate");
  const $listBtn = qs("#btnList");
  const $out = qs("#out");
  const $badge = qs("#badge");

  let state = {
    user_id: null,
    token: null,
    character_id: null,
    arc_id: null,
    provider: "MOCK",
    mock: true,
    version: "v?",
  };

  // ---------- helpers ----------
  function qs(s) { return document.querySelector(s); }
  function qsa(s) { return [...document.querySelectorAll(s)]; }
  function getLevel() {
    const r = $levelRadios.find(x => x.checked);
    return r ? Number(r.value) : 2;
  }
  function say(x) {
    $out.value = (typeof x === "string") ? x : JSON.stringify(x, null, 2);
  }

  async function api(path, body) {
    const resp = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `${resp.status} ${resp.statusText}`);
    return data;
  }

  // ---------- init badge ----------
  (async () => {
    try {
      const r = await fetch(`${API}/status`);
      const s = await r.json();
      state.version = s?.version || "v?";
      state.mock = !!s?.flags?.MOCK;
      state.provider = s?.provider || (state.mock ? "MOCK" : "MISTRAL");
      $badge.textContent = `worker ${state.version} • provider: ${state.provider} • mock: ${state.mock ? "ON" : "OFF"}`;
    } catch {
      $badge.textContent = `worker ? • (status ej nåddes)`;
    }
  })();

  // ---------- events ----------
  $sessionBtn?.addEventListener("click", async () => {
    try {
      const s = await api("/session", {});
      state.user_id = s.user_id;
      state.token = s.token;
      say({ ok: true, session: s });
    } catch (e) {
      say(`Error: ${e.message}`);
    }
  });

  $charBtn?.addEventListener("click", async () => {
    try {
      guardSession();
      const name = ($charName.value || "").trim() || "Mia";
      const r = await api("/characters/create", { user_id: state.user_id, name });
      state.character_id = r.character_id;
      say(r);
    } catch (e) {
      say(`Error: ${e.message}`);
    }
  });

  $arcBtn?.addEventListener("click", async () => {
    try {
      guardSession(true);
      const r = await api("/arcs/start", {
        user_id: state.user_id,
        character_id: state.character_id,
        title: "Första mötet",
      });
      state.arc_id = r.arc_id;
      say(r);
    } catch (e) {
      say(`Error: ${e.message}`);
    }
  });

  $genBtn?.addEventListener("click", async () => {
    try {
      guardSession(true, true);
      const payload = {
        user_id: state.user_id,
        character_id: state.character_id,
        arc_id: state.arc_id,
        prompt: ($prompt.value || "").trim(),
        level: getLevel(),
        lang: $langSel.value,
        words: Number($wordsSel.value || 180),
      };
      const ep = await api("/episodes/generate", payload);
      say(ep);
    } catch (e) {
      say(`Error: ${e.message}`);
    }
  });

  $listBtn?.addEventListener("click", async () => {
    try {
      guardSession(true, true);
      const items = await api("/episodes/by-character", {
        user_id: state.user_id,
        character_id: state.character_id,
        limit: 10,
      });
      say(items);
    } catch (e) {
      say(`Error: ${e.message}`);
    }
  });

  function guardSession(needChar = false, needArc = false) {
    if (!state.user_id) throw new Error("Ingen session – klicka 'Skapa anonym session' först.");
    if (needChar && !state.character_id) throw new Error("Ingen karaktär – klicka 'Skapa karaktär' först.");
    if (needArc && !state.arc_id) throw new Error("Ingen story-arc – klicka 'Starta arc' först.");
  }
})();
