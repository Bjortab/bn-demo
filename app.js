// ======= Frontend för Blush Narratives =======
// Matchar backend-endpoints:
//   POST /api/generate   -> { ok, text } från Mistral/OpenAI
//   POST /api/tts        -> returnerar audio/mp3 (OpenAI TTS)
// Körs på Cloudflare Pages med Functions i samma origin.

const API_BASE = location.origin;

// --- DOM refs ---
const els = {
  // topp-kontroller
  length: document.getElementById("length"),           // <select> 1..15 (minuter)
  // nivå-knappar (radio: name="level")
  levels: Array.from(document.querySelectorAll('input[name="level"]')),
  voice: document.getElementById("voice"),             // <select> röster
  speed: document.getElementById("speed"),             // <select> 0.75x..1.5x

  // textfält + knappar
  idea: document.getElementById("idea"),               // <textarea>
  btnGen: document.getElementById("btnGen"),           // "Skapa text"
  btnRead: document.getElementById("btnRead"),         // "Läs upp"
  btnDownload: document.getElementById("btnDownload"), // "Ladda ner .txt"

  // status + ljud + text
  status: document.getElementById("status"),
  player: document.getElementById("player"),
  excerpt: document.getElementById("excerpt"),
};

// --- UI helpers ---
function uiStatus(msg, kind = "info") {
  if (!els.status) return;
  els.status.textContent = msg || "";
  els.status.style.color =
    kind === "error" ? "#ff6b6b" :
    kind === "ok"    ? "#9ae6b4" : "#d7d7ff";
}

function disableAll(disabled) {
  [els.btnGen, els.btnRead, els.btnDownload, els.length, els.voice, els.speed, els.idea, ...els.levels]
    .forEach(n => n && (n.disabled = !!disabled));
}

// ord-approx från minuter (~170 ord/min)
function calcWords(mins) {
  const w = Math.round(170 * Math.max(1, Math.min(15, mins)));
  return w;
}

function getSelectedLevel() {
  const picked = els.levels.find(r => r.checked);
  return picked ? Number(picked.value) : 2;
}

function currentPayload() {
  return {
    idea: (els.idea.value || "").trim(),
    level: getSelectedLevel(),
    minutes: Number(els.length.value) || 5
  };
}

function showExcerpt(fullText) {
  if (!els.excerpt) return;
  // visa hela texten i story-rutan; frontend låter användaren scrolla
  els.excerpt.value = fullText || "";
}

// Nedladdning av textfil
function downloadTxt(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Hämta med timeout (ms)
async function fetchJSON(path, body, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal
    });

    if (!res.ok) {
      let detail = "";
      try { detail = await res.text(); } catch {}
      throw new Error(`${res.status} :: ${detail}`);
    }
    const data = await res.json();
    return data;
  } finally {
    clearTimeout(t);
  }
}

// Hämta binär (audio) med timeout
async function fetchAudio(path, body, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`${res.status} :: ${errText}`);
    }
    return await res.blob();
  } finally {
    clearTimeout(t);
  }
}

// --- Event handlers ---
async function onGenerate() {
  const p = currentPayload();
  if (!p.idea) {
    uiStatus("Skriv en idé först 🙏", "error");
    els.idea.focus();
    return;
  }

  const words = calcWords(p.minutes);
  uiStatus(`Skapar text (~${words} ord) …`, "info");
  disableAll(true);

  try {
    const data = await fetchJSON("/api/generate", p, 60000);
    if (!data?.ok || !data?.text) {
      throw new Error(data?.detail || "Tomt svar från /api/generate");
    }
    showExcerpt(data.text);
    uiStatus("Text klar ✔️", "ok");
  } catch (err) {
    uiStatus(`Generate failed: ${String(err.message || err)}`, "error");
  } finally {
    disableAll(false);
  }
}

async function onRead() {
  const p = currentPayload();

  // Om användaren inte genererat text här – försök först skapa
  if (!(els.excerpt.value || "").trim()) {
    await onGenerate();
    if (!(els.excerpt.value || "").trim()) {
      // om fortfarande tomt – avbryt
      return;
    }
  }

  // Läs upp texten vi har i rutan (backend tar text från body.text om den finns)
  const text = els.excerpt.value.trim();
  const voice = els.voice.value;
  const speed = parseFloat(els.speed.value || "1.0");

  uiStatus("Skapar ljud …", "info");
  disableAll(true);

  try {
    const blob = await fetchAudio("/api/tts", {
      text,
      voice,
      speed
    }, 90000);

    const url = URL.createObjectURL(blob);
    els.player.src = url;
    els.player.playbackRate = speed || 1.0;
    await els.player.play().catch(() => {});
    uiStatus("Klart ✔️", "ok");
  } catch (err) {
    uiStatus(`TTS failed: ${String(err.message || err)}`, "error");
  } finally {
    disableAll(false);
  }
}

function onDownload() {
  const s = (els.excerpt.value || "").trim();
  if (!s) {
    uiStatus("Ingen text att ladda ner ännu.", "error");
    return;
  }
  const dt = new Date();
  const stamp = dt.toISOString().slice(0,19).replace(/[:T]/g, "-");
  downloadTxt(`blush-${stamp}.txt`, s);
}

// --- Init ---
function init() {
  // defaultar nivå 2 om ingen vald
  if (!els.levels.some(r => r.checked) && els.levels[1]) {
    els.levels[1].checked = true; // 1->index0, 2->index1
  }

  // UI-kopplingar
  els.btnGen?.addEventListener("click", onGenerate);
  els.btnRead?.addEventListener("click", onRead);
  els.btnDownload?.addEventListener("click", onDownload);

  els.length?.addEventListener("change", () => {
    const words = calcWords(Number(els.length.value) || 5);
    uiStatus(`≈ ${words} ord (~${els.length.value} min)`, "info");
    setTimeout(() => uiStatus(""), 1200);
  });

  // Snyggare fokusbeteende
  els.idea?.addEventListener("focus", () => els.idea.select());

  // Se till att spelaren syns och kan styras
  if (els.player) {
    els.player.controls = true;
    els.player.preload = "none";
    els.player.playbackRate = parseFloat(els.speed.value || "1.0");
  }
}
document.addEventListener("DOMContentLoaded", init);
