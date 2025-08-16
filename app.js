// app.js
(() => {
  const els = {
    lvlBtns: [...document.querySelectorAll('[data-level]')],
    voice: document.getElementById('voice'),
    idea: document.getElementById('idea'),
    btnPreview: document.getElementById('btnPreview'),
    btnRead: document.getElementById('btnRead'),
    btnDownload: document.getElementById('btnDownload'),
    excerpt: document.getElementById('excerpt'),
    player: document.getElementById('player'),
    status: document.getElementById('status'),
    accept: document.getElementById('accept'),
    gate: document.getElementById('gate'),
    create: document.getElementById('create')
  };

  let level = 3;
  let lastText = "";

  function setStatus(msg, bad = false) {
    if (!els.status) return;
    els.status.textContent = msg || "";
    els.status.style.color = bad ? "#ff6b6b" : "#a3e3a1";
  }

  // 18+ gate
  if (els.accept && els.create && els.gate) {
    const enter = () => {
      if (els.accept.checked) {
        els.gate.style.display = "none";
        els.create.style.display = "";
      }
    };
    els.create.addEventListener('click', enter);
  }

  // nivåknappar
  els.lvlBtns.forEach(b => {
    b.addEventListener('click', () => {
      els.lvlBtns.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      level = Number(b.dataset.level || 3);
    });
  });

  // hämta text från /api/generate
  async function genText() {
    setStatus("Genererar text …");
    const idea = (els.idea.value || "").trim();
    const payload = { idea, level, minutes: 5 };
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000)
    });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    lastText = data.text || "";
    els.excerpt.value = lastText.slice(0, 800);
    setStatus("Klar.");
    return lastText;
  }

  // TTS via /api/tts (1.25x)
  async function playTTS(text) {
    setStatus("Skapar röst …");
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: els.voice.value || "alloy", speed: 1.25 }),
      signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) throw new Error(await r.text());
    const blob = await r.blob();
    els.player.src = URL.createObjectURL(blob);
    await els.player.play();
    setStatus("Spelar upp.");
  }

  els.btnPreview?.addEventListener('click', async () => {
    try { await genText(); } catch (e) { setStatus(`Fel: ${String(e).slice(0,160)}`, true); }
  });

  els.btnRead?.addEventListener('click', async () => {
    try {
      const txt = lastText || await genText();
      await playTTS(txt);
    } catch (e) {
      setStatus(`Generate failed: ${String(e).slice(0,180)}`, true);
    }
  });

  els.btnDownload?.addEventListener('click', () => {
    const blob = new Blob([lastText || els.idea.value || ""], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "berattelse.txt";
    a.click();
  });
})();
