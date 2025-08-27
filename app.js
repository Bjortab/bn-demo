// app.js — Golden Copy v1.2
(() => {
  const $ = (q) => document.querySelector(q);
  const api = {
    gen:  "/api/generate",
    tts:  "/api/tts",
    health:"/api/health",
    ver:  "/api/version",
  };

  const el = {
    level:  $('#level'),
    voice:  $('#voice'),
    tempo:  $('#tempo'),
    idea:   $('#userIdea'),
    out:    $('#output'),
    gen:    $('#generateBtn'),
    play:   $('#listenBtn'),
    stop:   $('#stopBtn'),
    apiOk:  $('#apiOk'),
    appVer: $('#appVer'),
  };

  let audio = null;
  let bindingDone = false;

  const safeJson = async (res) => {
    const txt = await res.text().catch(()=> "");
    try { return JSON.parse(txt); } catch { return { ok:false, error:"Ogiltig JSON", raw: txt }; }
  };
  const ui = (t) => { if (el.out) el.out.textContent = t ?? ""; };

  async function health() {
    try {
      const r = await fetch(api.health);
      const j = await safeJson(r);
      if (el.apiOk) el.apiOk.textContent = j?.ok ? "API: ok" : "API: fel";
    } catch { if (el.apiOk) el.apiOk.textContent = "API: fel"; }
  }

  function getMinutes() {
    const picked = document.querySelector('input[name="length"]:checked');
    return Number(picked?.value || 5);
  }

  async function onGenerate() {
    ui("(skriver…)");
    try {
      const body = {
        idea: (el.idea?.value || "").trim(),
        level: Number(el.level?.value || 3),
        minutes: getMinutes()
      };
      const res = await fetch(api.gen, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(body)
      });
      const data = await safeJson(res);
      if (!res.ok || !data.ok) {
        ui("(kunde inte generera)");
        console.warn("generate error", data);
        return;
      }
      ui(data.story || "(tomt)");
    } catch (e) {
      ui("(nätverksfel)");
      console.error(e);
    }
  }

  async function onListen() {
    const text = el.out?.textContent?.trim();
    if (!text) return;

    try { audio?.pause(); } catch {}
    audio = null;

    try {
      const body = {
        text,
        voice: el.voice?.value || "verse",
        speed: Number(el.tempo?.value || 1.0)
      };
      const r = await fetch(api.tts, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(body)
      });
      const j = await safeJson(r);
      if (!r.ok || !j.ok || !j.url) {
        console.warn("tts error", j);
        return;
      }
      audio = new Audio(j.url);
      audio.play().catch(()=>{});
    } catch (e) {
      console.error(e);
    }
  }

  function onStop() {
    try { audio?.pause(); } catch {}
  }

  function bindOnce() {
    if (bindingDone) return;
    el.gen?.addEventListener("click", onGenerate);
    el.play?.addEventListener("click", onListen);
    el.stop?.addEventListener("click", onStop);
    bindingDone = true;
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindOnce();
    if (el.appVer) el.appVer.textContent = "v1.2";
    health();
  });

  // Rescue i konsolen: BN_rescue()
  window.BN_rescue = () => { bindOnce(); return "Rescue OK"; };
})();
