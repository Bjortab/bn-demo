// app.js – klientlogik för BN
// Viktigt: den här versionen POST:ar till /api/tts och sätter upp 1.25× playback-rate.

const els = {
  minutes: document.querySelector('#length'),
  // snusk-knappar (1–5): radio inputs med name="spice"
  spiceRadios: [...document.querySelectorAll('input[name="spice"]')],
  voice: document.querySelector('#voice'),
  idea: document.querySelector('#idea'),

  btnPreview: document.querySelector('#btnPreview'),
  btnRead: document.querySelector('#btnRead'),
  btnDownload: document.querySelector('#btnDownload'),

  status: document.querySelector('#status'),
  excerpt: document.querySelector('#excerpt'),
  player: document.querySelector('#player')
};

// Hjälp: hämta vald snusk-nivå 1–5
function getSpiceLevel() {
  const r = els.spiceRadios.find(x => x.checked);
  return r ? Number(r.value) : 1;
}

// Hjälp: enkel statusrad
function uiStatus(msg, isError = false) {
  if (!els.status) return;
  els.status.textContent = msg || "";
  els.status.style.color = isError ? "#ff6b6b" : "#9cc67b";
}

// Kort timeout så mobiler inte ”hänger”
async function api(path, payload, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: "POST",                          // <-- VIKTIGT: POST!
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: ctrl.signal
    });
    clearTimeout(t);
    return res;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

function calcWords(mins) {
  const wpm = 170;
  return Math.max(200, Math.min(900, Math.round(mins * wpm)));
}

// Klipp ut en förhandsvisning
function makeExcerpt(full, maxChars = 300) {
  if (!full) return "";
  const s = full.trim();
  if (s.length <= maxChars) return s;
  // klipp vid närmaste punkt om möjligt
  const cut = s.lastIndexOf('.', maxChars);
  return s.slice(0, cut > 120 ? cut + 1 : maxChars) + (cut > 120 ? "" : " …");
}

// Läs upp (generera text → TTS → spela)
async function onReadClick() {
  try {
    uiStatus("Genererar berättelse …");
    const minutes = Number(els.minutes?.value || 5);
    const level = getSpiceLevel();
    const voice = els.voice?.value || "alloy";
    const idea = els.idea?.value?.trim() || "";

    if (!idea) {
      uiStatus("Skriv in en idé först.", true);
      return;
    }

    // 1) Generera text
    const genRes = await api("/api/generate", { idea, minutes, level });
    if (!genRes.ok) {
      const tt = await genRes.text().catch(()=>"");
      uiStatus(`Textgenerering misslyckades (${genRes.status}).`, true);
      console.error("generate error:", tt);
      return;
    }
    const { text } = await genRes.json();
    if (!text || !text.trim()) {
      uiStatus("Textgenereringen gav tomt resultat. Testa en annan formulering.", true);
      return;
    }

    els.excerpt.textContent = makeExcerpt(text);

    // 2) TTS (POST!)
    uiStatus("Skapar röst …");
    const ttsRes = await api("/api/tts", { text, voice });
    if (!ttsRes.ok) {
      const tt = await ttsRes.text().catch(()=>"");
      uiStatus(`TTS misslyckades (${ttsRes.status}).`, true);
      console.error("tts error:", tt);
      return;
    }
    const buf = await ttsRes.arrayBuffer();
    const blob = new Blob([buf], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    // 3) Spela upp med 1.25×
    els.player.src = url;
    els.player.playbackRate = 1.25;   // standard 1.25×
    await els.player.play().catch(() => {});
    uiStatus("Klar.");
  } catch (e) {
    uiStatus(e.name === "AbortError" ? "Avbrutet (timeout)." : "Fel vid uppspelning.", true);
    console.error(e);
  }
}

// Ladda ner text
function onDownload() {
  const text = els.excerpt?.textContent?.trim();
  if (!text) {
    uiStatus("Ingen text att ladda ner ännu.", true);
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = "berattelse.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Event-koppling
els.btnRead?.addEventListener('click', onReadClick);
els.btnDownload?.addEventListener('click', onDownload);
// ”Förhandslyssna” låter bara spela senaste clip om det finns
els.btnPreview?.addEventListener('click', () => {
  if (els.player?.src) {
    els.player.playbackRate = 1.25;
    els.player.play().catch(() => {});
  } else {
    uiStatus("Ingen röst genererad ännu.", true);
  }
});

// Init-status
uiStatus("");
