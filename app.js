/* BN front – app.js (Hotfix: robust textarea-detektering + DOMContentLoaded) */

(function () {
  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);

  function now() {
    return new Date().toLocaleTimeString([], { hour12: false });
  }

  function appendStatus(msg) {
    const pre = $("#output");
    if (!pre) return;
    const line = msg ? `[${now()}] ${msg}` : "";
    pre.textContent = pre.textContent ? pre.textContent + "\n" + line : line;
  }

  function setStatus(msg) {
    const s = $("#status");
    if (s) s.textContent = msg || "";
    appendStatus(msg);
  }

  function setProviderModel(provider = "", model = "") {
    const p = $("#provider");
    const m = $("#model");
    if (p) p.textContent = provider || "-";
    if (m) m.textContent = model || "-";
  }

  // Hämta värde ur textarean – prova flera vägar
  function getIdeaValue() {
    const el =
      $("#userIdea") ||
      $("#idea") ||
      document.querySelector("textarea");
    return (el && typeof el.value === "string") ? el.value.trim() : "";
  }

  // Nolla / säkra audio
  let currentURL = null;
  function resetAudio() {
    try {
      const a = $("#audio");
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.currentTime = 0;
      }
      if (currentURL) {
        URL.revokeObjectURL(currentURL);
        currentURL = null;
      }
    } catch {}
  }

  // Timeout-säker fetch
  async function fetchWithTimeout(url, opts = {}, timeoutMs = 90000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- Actions ----------
  let busyGen = false;

  async function doHealth() {
    try {
      const r = await fetch("/api/health");
      const j = await r.json().catch(() => ({}));
      appendStatus(j && j.ok ? "API: ok" : "API: fel?");
    } catch {
      appendStatus("API: fel vid health");
    }
  }

  async function doGenerate() {
    if (busyGen) return;
    const idea = getIdeaValue();
    if (!idea) {
      setStatus("Skriv en idé först.");
      return;
    }

    busyGen = true;
    setProviderModel("-", "-");
    resetAudio();
    const story = $("#story");
    if (story) story.textContent = "";
    appendStatus("");
    appendStatus("Genererar…");

    const level   = Number(($("#level")?.value)  || 3);
    const minutes = Number(($("#length")?.value) || 5);
    const tempo   = Number(($("#tempo")?.value)  || 1.0);

    try {
      const res = await fetchWithTimeout("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea, level, minutes, tempo })
      }, 120000);

      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        setStatus(`Fel vid generering: HTTP ${res.status}`);
        if (raw) appendStatus(raw);
        return;
      }

      // JSON först, annars text
      let data, textOut = "";
      try {
        data = await res.json();
        textOut = data?.text || data?.story || "";
      } catch {
        textOut = await res.text();
      }

      if (!textOut) {
        setStatus("Kunde inte generera – tomt svar.");
        return;
      }

      setProviderModel(data?.provider || "", data?.model || "");
      if (story) story.textContent = textOut;

      appendStatus("Väntar röst…");
      await doTTS(textOut, ($("#voice")?.value) || "alloy");

      setStatus("Klart.");
    } catch (err) {
      setStatus(`Fel: ${err?.name === "AbortError" ? "Timeout." : (err?.message || "okänt fel")}`);
    } finally {
      busyGen = false;
      // knappar
      const bGen = $("#generateBtn");
      if (bGen) bGen.disabled = false;
    }
  }

  async function doTTS(text, voice) {
    const audio = $("#audio");
    if (!audio) {
      appendStatus("TTS: ingen <audio>.");
      return;
    }
    try {
      const res = await fetchWithTimeout("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, voice })
      }, 90000);

      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        appendStatus(`TTS-fel: HTTP ${res.status}`);
        if (raw) appendStatus(raw);
        return;
      }

      const blob = await res.blob();
      resetAudio();
      currentURL = URL.createObjectURL(blob);
      audio.src = currentURL;

      try {
        await audio.play();
      } catch {
        appendStatus("TTS: kräver extra klick (iOS).");
      }
    } catch (err) {
      appendStatus(`TTS-fel: ${err?.name === "AbortError" ? "timeout" : (err?.message || "okänt")}`);
    }
  }

  // ---------- Bind när DOM är klar ----------
  window.addEventListener("DOMContentLoaded", () => {
    // Knappar
    $("#generateBtn")?.addEventListener("click", (e) => { e.preventDefault(); doGenerate(); });
    $("#listenBtn")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const audio = $("#audio");
      if (!audio?.src) {
        const txt = $("#story")?.textContent || "";
        if (!txt) { setStatus("Inget att läsa upp ännu."); return; }
        appendStatus("Väntar röst…");
        await doTTS(txt, ($("#voice")?.value) || "alloy");
      } else {
        try { await audio.play(); } catch { appendStatus("TTS: tryck Lyssna igen."); }
      }
    });
    $("#stopBtn")?.addEventListener("click", (e) => { e.preventDefault(); try { $("#audio")?.pause(); } catch {} });

    setStatus("BN front laddad.");
    doHealth();
  });
})();
