(() => {
  const $ = (s) => document.querySelector(s);
  const api = {
    base: location.origin,
    gen:  "/api/generate",
    tts:  "/api/tts",
    health:"/api/health",
    ver:  "/api/version",
  };

  let audio, currentStory = "", wired = false;

  function wireOnce() {
    if (wired) return; wired = true;
    $("#generateBtn")?.addEventListener("click", onGenerate);
    $("#listenBtn")?.addEventListener("click", onListen);
    $("#stopBtn")?.addEventListener("click", onStop);
  }

  function ui(msg) { const out = $("#output"); if (out) out.textContent = msg ?? ""; }
  function val(id, fallback) { const el = $("#" + id); return el?.value ?? fallback; }
  function num(id, fallback) { const v = Number(val(id, fallback)); return isNaN(v) ? fallback : v; }

  async function onGenerate() {
    wireOnce();
    ui("Genererar …");
    currentStory = "";

    const body = {
      idea: ($("#useridea")?.value || "").trim(),
      level: Number(document.querySelector('input[name="level"]:checked')?.value || 1),
      minutes: Number(document.querySelector('input[name="length"]:checked')?.value || 5),
    };

    try {
      const r = await fetch(api.gen, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || ("Gen fail: " + r.status));
      currentStory = j.story || "";
      ui(currentStory || "(tomt)");
      // Autoplay direkt när vi faktiskt har text
      if (currentStory) await onListen();
    } catch (e) {
      ui("Fel: " + (e.message || e));
      console.error(e);
    }
  }

  async function onListen() {
    wireOnce();
    if (!currentStory) return ui("Ingen berättelse ännu.");
    ui("Hämtar röst …");

    const voice = val("voice", "verse");
    const speed = num("tempo", 1.0);

    try {
      const r = await fetch(api.tts, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: currentStory, voice, speed }) });
      if (!r.ok) throw new Error("TTS: " + (await r.text().catch(()=>r.status)));
      const blob = await r.blob();
      audio?.pause();
      audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => URL.revokeObjectURL(audio.src);
      await audio.play();
      ui("Spelar upp …");
    } catch (e) {
      ui("TTS-fel: " + (e.message || e));
      console.error(e);
    }
  }

  function onStop() { try { audio?.pause(); } catch {} ui(""); }

  // Start
  document.addEventListener("DOMContentLoaded", () => {
    wireOnce();
    $("#appVer") && ($("#appVer").textContent = "BN front v" + (window.APP_VER || "?") + " (CF server)");
    // Snabb hälsokoll i UI:
    fetch(api.health).then(r=>r.json()).then(j => { const el=$("#apiOk"); if (el) el.textContent = j?.ok ? "API: ok" : "API: fel"; }).catch(()=>{ const el=$("#apiOk"); if (el) el.textContent="API: fel"; });
  });
})();
