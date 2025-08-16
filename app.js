// /app.js
// Frontend: längre timeouts + tvinga playbackRate = 1.0 + robust felhantering

// ====== Konfig ======
const API_BASE = ""; // lämna tomt på Pages (relativa /api/*)
const GENERATE_TIMEOUT_MS = 60000; // 60s
const TTS_TIMEOUT_MS = 60000;       // 60s
const DEFAULT_VOICE = "alloy";
const TTS_SPEED = 1.0;              // <-- normal hastighet

// ====== DOM ======
const els = {
  length: document.getElementById("length"),
  levelRadios: document.querySelectorAll('input[name="level"]'),
  voice: document.getElementById("voice"),
  idea: document.getElementById("idea"),
  btnPreview: document.getElementById("btnPreview"),
  btnRead: document.getElementById("btnRead"),
  btnDownload: document.getElementById("btnDownload"),
  status: document.getElementById("status"),
  excerpt: document.getElementById("excerpt"),
  player: document.getElementById("player")
};

// Se till att textarean är rimlig på mobilen
if (els.idea) {
  els.idea.rows = 4;
  els.idea.style.minHeight = "96px";
}

// ====== Hjälpare ======
function uiStatus(msg, isError = false) {
  if (!els.status) return;
  els.status.textContent = msg || "";
  els.status.style.color = isError ? "#ff7070" : "#98c67b";
}

function getLevel() {
  const r = Array.from(els.levelRadios).find(x => x.checked);
  return r ? Number(r.value) : 1;
}

function getPayload(asBlob = false) {
  return {
    minutes: Number(els.length?.value || 5),
    level: getLevel(),
    voice: (els.voice?.value || DEFAULT_VOICE),
    idea: (els.idea?.value || "").trim(),
    asBlob
  };
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// ====== Flöden ======
async function doGenerate() {
  const payload = getPayload(false);
  if (!payload.idea) {
    uiStatus("Skriv in en idé först.", true);
    return { ok: false };
  }
  uiStatus("Genererar text …");

  const res = await fetchWithTimeout(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idea: payload.idea,
      minutes: payload.minutes,
      level: payload.level
    })
  }, GENERATE_TIMEOUT_MS).catch(() => null);

  if (!res || !res.ok) {
    const detail = res ? await res.text().catch(() => "") : "no_response";
    uiStatus(`Generate failed: ${res?.status || ""} :: ${detail.slice(0, 120)}`, true);
    return { ok: false };
  }

  const data = await res.json().catch(() => ({}));
  const text = data?.text?.trim() || "";
  if (!text) {
    uiStatus("Textgenereringen gav tomt svar. Försök igen.", true);
    return { ok: false };
  }

  // Visa utdrag
  if (els.excerpt) {
    els.excerpt.value ? (els.excerpt.value = text) : (els.excerpt.textContent = text);
  }
  uiStatus("Text klar.");
  return { ok: true, text };
}

async function doTTS(text, voice) {
  uiStatus("Skapar röst …");
  const res = await fetchWithTimeout(`${API_BASE}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, speed: TTS_SPEED })
  }, TTS_TIMEOUT_MS).catch(() => null);

  if (!res || !res.ok) {
    const detail = res ? await res.text().catch(() => "") : "no_response";
    uiStatus(`TTS failed: ${res?.status || ""} :: ${detail.slice(0, 120)}`, true);
    return { ok: false };
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  // Sätt uppspelning
  if (els.player) {
    els.player.src = url;
    els.player.controls = true;            // visa kontroller
    els.player.playbackRate = 1.0;         // tvinga 1.0x
    try { await els.player.play(); } catch (_) {}
  }
  uiStatus("Klar.");
  return { ok: true };
}

// ====== Event ======
if (els.btnPreview) {
  els.btnPreview.addEventListener("click", async () => {
    await doGenerate();
  });
}

if (els.btnRead) {
  els.btnRead.addEventListener("click", async () => {
    const g = await doGenerate();
    if (!g.ok) return;
    await doTTS(g.text, (els.voice?.value || DEFAULT_VOICE));
  });
}

if (els.btnDownload) {
  els.btnDownload.addEventListener("click", async () => {
    const g = await doGenerate();
    if (!g.ok) return;
    const blob = new Blob([g.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "berattelse.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}
