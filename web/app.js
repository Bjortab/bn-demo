(() => {
  "use strict";

  // ----- KONFIG -----
  // Pekar frontend mot workerns API
  const API_BASE = "https://bn-worker.bjorta-bb.workers.dev/api/v1";

  // Nivå-beskrivningar (visas under knapparna)
  const LEVEL_TEXT = {
    1: "1 – Romantiskt, bara stämning.",
    2: "2 – Antydande sensuellt, beröring & metaforer. Inga könsord.",
    3: "3 – Sensuellt, lite mer kropp, försiktig vokabulär.",
    4: "4 – Explicit men utan grova ord.",
    5: "5 – Explicit & direkt inom lagens ramar.",
  };

  // ----- DOM -----
  const el = (id) => document.getElementById(id);
  const statusEl = el("status");
  const lvlInfo = el("lvlInfo");
  const out = el("out");
  const meta = el("meta");

  // ----- State -----
  let SESSION = null;
  let CHARACTER_ID = null;
  let ARC_ID = null;

  // ----- Utils -----
  function getLevel() {
    const n = document.querySelector('input[name="lvl"]:checked');
    return n ? Number(n.value) : 2;
  }

  function show(o) {
    out.textContent = typeof o === "string" ? o : JSON.stringify(o, null, 2);
  }

  async function post(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} – ${txt}`);
    }
    return res.json();
  }

  // ----- Init status -----
  async function initStatus() {
    try {
      const r = await fetch(`${API_BASE}/status`);
      const js = await r.json();
      statusEl.textContent = `worker v${js.version} • provider: ${js.provider} • mock: ${js.mock ? "ON" : "OFF"}`;
      meta.textContent = `API: ${API_BASE}`;
    } catch (e) {
      statusEl.textContent = "status: (kunde inte läsa)";
    }
  }

  // ----- Level hint -----
  document.getElementById("levels").addEventListener("change", () => {
    lvlInfo.textContent = LEVEL_TEXT[getLevel()];
  });

  // ----- Buttons -----
  el("btnSession").addEventListener("click", async () => {
    try {
      const s = await post("/session", {});
      SESSION = s;
      show(s);
      alert("Anonym session skapad.");
    } catch (e) {
      show(String(e));
    }
  });

  el("btnChar").addEventListener("click", async () => {
    try {
      const name = el("charName").value.trim() || "Mia";
      const c = await post("/characters/create", { user_id: SESSION?.user_id, name });
      CHARACTER_ID = c.character_id;
      show(c);
    } catch (e) {
      show(String(e));
    }
  });

  el("btnArc").addEventListener("click", async () => {
    try {
      const title = el("arcTitle").value.trim() || "Första mötet";
      const a = await post("/arcs/start", {
        user_id: SESSION?.user_id,
        character_id: CHARACTER_ID,
        title,
      });
      ARC_ID = a.arc_id;
      show(a);
    } catch (e) {
      show(String(e));
    }
  });

  el("btnGen").addEventListener("click", async () => {
    try {
      const level = getLevel();
      const prompt = el("prompt").value.trim() || "vi möttes på tåget…";
      const lang = el("lang").value || "sv";
      const words = Number(el("words").value || 180);

      const ep = await post("/episodes/generate", {
        user_id: SESSION?.user_id,
        character_id: CHARACTER_ID,
        arc_id: ARC_ID,
        level,
        lang,
        words,
        prompt,
      });

      show(ep);
    } catch (e) {
      show(String(e));
    }
  });

  el("btnList").addEventListener("click", async () => {
    try {
      const list = await post("/episodes/by-character", {
        user_id: SESSION?.user_id,
        character_id: CHARACTER_ID,
        limit: 10,
      });
      show(list);
    } catch (e) {
      show(String(e));
    }
  });

  el("btnSend").addEventListener("click", () => {
    alert("Tack! (mock)");
  });

  // ----- Go -----
  initStatus();
})();
