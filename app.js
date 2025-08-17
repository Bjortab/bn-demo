// /app.js – läser nivå från name="spice", robust timeout, 1.0× uppspelning

const API_BASE = "";                // relativt /api på Cloudflare Pages
const GENERATE_TIMEOUT_MS = 60000;
const TTS_TIMEOUT_MS = 60000;
const DEFAULT_VOICE = "alloy";
const TTS_SPEED = 1.0;              // normal hastighet

const els = {
  length: document.getElementById("length"),
  // VIKTIGT: läs radios med name="spice" (din HTML)
  spiceRadios: Array.from(document.querySelectorAll('input[name="spice"]')),
  voice: document.getElementById("voice"),
  idea: document.getElementById("idea"),
  btnPreview: document.getElementById("btnPreview"),
  btnRead: document.getElementById("btnRead"),
  btnDownload: document.getElementById("btnDownload"),
  status: document.getElementById("status"),
  excerpt: document.getElementById("excerpt"),
  player: document.getElementById("player")
};

function uiStatus(msg, isError = false) {
  if (!els.status) return;
  els.status.textContent = msg || "";
  els.status.style.color = isError ? "#ff7070" : "#98c67b";
}

function getLevel() {
  const r = els.spiceRadios.find(x => x.checked);
  return r ? Number(r.value) : 1;
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: controller.signal }); }
  finally { clearTimeout(id); }
}

async function doGenerate() {
  const idea = (els.idea?.value || "").trim();
  if (!idea) { uiStatus("Skriv in en idé först.", true); return { ok:false }; }

  uiStatus("Genererar text …");
  const minutes = Number(els.length?.value || 5);
  const level = getLevel();

  const res = await fetchWithTimeout(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, minutes, level })
  }, GENERATE_TIMEOUT_MS).catch(() => null);

  if (!res || !res.ok) {
    const detail = res ? await res.text().catch(()=> "") : "no_response";
    uiStatus(`Generate failed: ${res?.status || ""} :: ${detail.slice(0,120)}`, true);
    return { ok:false };
  }

  const data = await res.json().catch(()=> ({}));
  const text = data?.text?.trim() || "";
  if (!text) { uiStatus("Tomt svar från modellen.", true); return { ok:false }; }

  if (els.excerpt) {
    // visa hela texten i utdragsrutan så du kan läsa
    els.excerpt.textContent = text;
  }
  uiStatus("Text klar.");
  return { ok:true, text };
}

async function doTTS(text, voice) {
  uiStatus("Skapar röst …");
  const res = await fetchWithTimeout(`${API_BASE}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, speed: TTS_SPEED })
  }, TTS_TIMEOUT_MS).catch(() => null);

  if (!res || !res.ok) {
    const detail = res ? await res.text().catch(()=> "") : "no_response";
    uiStatus(`TTS failed: ${res?.status || ""} :: ${detail.slice(0,120)}`, true);
    return { ok:false };
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (els.player) {
    els.player.src = url;
    els.player.controls = true;
    els.player.playbackRate = 1.0;       // tvinga 1.0×
    try { await els.player.play(); } catch(_) {}
  }
  uiStatus("Klar.");
  return { ok:true };
}

// knappar
els.btnPreview?.addEventListener("click", async () => { await doGenerate(); });
els.btnRead?.addEventListener("click", async () => {
  const g = await doGenerate();
  if (!g.ok) return;
  await doTTS(g.text, (els.voice?.value || DEFAULT_VOICE));
});
els.btnDownload?.addEventListener("click", async () => {
  const g = await doGenerate();
  if (!g.ok) return;
  const blob = new Blob([g.text], { type:"text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "berattelse.txt";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});
