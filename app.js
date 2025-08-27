// app.js — BN front v1.1 stabil
(() => {
  const $ = (s) => document.querySelector(s);

  const el = {
    apiOk: $("#apiOk"),
    idea:  $("#idea"),
    level: () => Number(document.querySelector('input[name="level"]:checked')?.value || 3),
    minutes: () => Number(document.querySelector('input[name="minutes"]:checked')?.value || 3),
    tempo: $("#tempo"),
    voiceSel: $("#voice"),

    out: $("#output"),
    genBtn: $("#generateBtn"),
    listenBtn: $("#listenBtn"),
    stopBtn: $("#stopBtn"),
  };

  // Init
  (async () => {
    try {
      const r = await fetch("/api/health");
      const h = await r.json().catch(()=>({}));
      if (h.ok) el.apiOk && (el.apiOk.textContent = "API: ok");
    } catch {}
  })();

  // UI helpers
  const setBusy = (busy) => {
    el.genBtn?.toggleAttribute("disabled", busy);
    el.listenBtn?.toggleAttribute("disabled", busy);
    el.stopBtn?.toggleAttribute("disabled", false);
  };
  const show = (html) => { el.out.innerHTML = html; };
  const showText = (t) => { el.out.textContent = t; };
  const esc = (s) => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  let audio;

  // Generate only (no autoplay)
  async function onGenerate() {
    try {
      setBusy(true);
      showText("Genererar …");

      const payload = {
        idea: (el.idea.value || "").trim(),
        level: el.level(),
        minutes: el.minutes(),
        voice: el.voiceSel?.value || "alloy"
      };

      const res = await fetch("/api/generate", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(()=> ({}));

      if (!data || data.ok === false || !data.story) {
        console.warn("Gen-fel:", data);
        show(`<div class="error">${esc(data?.error || "(tomt)")}</div>`);
        setBusy(false);
        return;
      }

      show(`<pre class="story">${esc(data.story)}</pre>`);
      // Efter lyckad gen: aktivera Lyssna, men autospelar inte (kräver klick)
      el.listenBtn?.removeAttribute("disabled");
    } catch (e) {
      console.error(e);
      show(`<div class="error">Nätverksfel</div>`);
    } finally {
      setBusy(false);
    }
  }

  // Play TTS
  async function onListen() {
    try {
      const txt = el.out.textContent?.trim();
      if (!txt) return;

      el.listenBtn?.setAttribute("disabled","disabled"); // förhindra dubbelklick

      const body = {
        text: txt,
        voice: el.voiceSel?.value || "alloy",
        speed: Number(el.tempo?.value || 1.0)
      };

      const r = await fetch("/api/tts", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(body)
      });

      if (!r.ok) {
        const msg = await r.text().catch(()=> "");
        alert("TTS-fel: " + msg);
        return;
      }

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      try { if (audio) audio.pause(); } catch {}
      audio = new Audio(url);
      audio.onended = () => { el.listenBtn?.removeAttribute("disabled"); };
      await audio.play().catch(() => {
        // iOS/Chrome autoplay-skydd – be om klick igen
        el.listenBtn?.removeAttribute("disabled");
      });
    } catch (e) {
      console.error(e);
      el.listenBtn?.removeAttribute("disabled");
    }
  }

  // Stop
  function onStop() {
    try { if (audio) audio.pause(); } catch {}
    el.listenBtn?.removeAttribute("disabled");
  }

  // Bind
  el.genBtn?.addEventListener("click", onGenerate);
  el.listenBtn?.addEventListener("click", onListen);
  el.stopBtn?.addEventListener("click", onStop);
})();
