// app.js — Golden Copy v1.3 (CF Pages)

// ====== helpers ======
const $ = (q) => document.querySelector(q);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ====== UI refs ======
const elLevel   = $("#level");
const elLength  = $("#length");
const elVoice   = $("#voice");
const elTempo   = $("#tempo");
const elIdea    = $("#userIdea");

const btnGen    = $("#generateBtn");
const btnPlay   = $("#listenBtn");
const btnStop   = $("#stopBtn");

const elOutput  = $("#output");
const elAudio   = $("#audio");

// ====== config ======
const BASE = location.origin + "/api";
const GEN_TIMEOUT_MS = 120_000;   // <— 120 sek
const RETRY_STATUS = new Set([408, 429, 502, 503, 504]);

let isBusy = false;
let ttsObj = null;

// ====== status helpers ======
function setBusy(b) {
  isBusy = b;
  btnGen.disabled  = b;
  btnPlay.disabled = b;
  btnStop.disabled = false;
}

function status(text) {
  elOutput.textContent = text;
}

function append(text) {
  elOutput.textContent += text;
}

// ====== health check (visar "API: ok?"-indikator) ======
async function checkHealth() {
  try {
    const res = await fetch(BASE + "/health");
    const ok = res.ok;
    const a = document.querySelector("#apiok");
    if (a) a.textContent = ok ? "ok" : "fail";
  } catch {
    const a = document.querySelector("#apiok");
    if (a) a.textContent = "fail";
  }
}
checkHealth();

// ====== generate ======
async function doGenerate() {
  if (isBusy) return;
  setBusy(true);
  status("(genererar …)");

  const idea   = (elIdea.value || "").trim();
  const level  = Number(elLevel.value || 3);
  const mins   = Number(elLength.value || 5);

  // timeouter via AbortController
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort("timeout"), GEN_TIMEOUT_MS);

  const payload = { idea, level, minutes: mins };

  async function oneTry() {
    const res = await fetch(BASE + "/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    // parse säkert
    const raw = await res.text();
    let data = {};
    try { data = JSON.parse(raw); } catch { /* noop */ }

    return { res, data, raw };
  }

  try {
    let attempt = 0;
    let last = null;

    while (attempt < 2) {
      attempt++;
      const { res, data, raw } = await oneTry();
      last = { res, data, raw };

      if (res.ok && data?.ok && data?.text) {
        status("");
        elOutput.textContent = data.text;
        setBusy(false);
        clearTimeout(to);
        return;
      }

      // Retry på “tillfälliga” statusar en gång
      if (RETRY_STATUS.has(res.status) && attempt === 1) {
        append("\n(upplever belastning – försöker igen …)");
        await sleep(1200);
        continue;
      }

      // annat fel → visa orsak
      const detail = data?.error || `HTTP ${res.status}`;
      status(`(fel vid generering: ${detail})`);
      setBusy(false);
      clearTimeout(to);
      return;
    }

    // fallthrough
    status("(kunde inte generera)");
  } catch (err) {
    const what = err?.name === "AbortError" ? "timeout" : (err?.message || err);
    status(`(fel: ${what})`);
  } finally {
    clearTimeout(to);
    setBusy(false);
  }
}

// ====== TTS (Play/Stop) ======
async function doTTS() {
  if (isBusy) return;
  const text = (elOutput.textContent || "").trim();
  if (!text) { status("(inget att läsa upp)"); return; }

  setBusy(true);
  status("Hämtar röst …");

  try {
    const res = await fetch(BASE + "/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        voice: (elVoice.value || "alloy"),
        speed: Number(elTempo.value || 1.0)
      })
    });

    if (!res.ok) {
      const msg = await res.text().catch(()=>"");
      status(`(TTS fel: ${msg || res.status})`);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    elAudio.src = url;
    await elAudio.play();
    status("Klar.");
  } catch (e) {
    status(`(TTS undantag: ${e?.message || e})`);
  } finally {
    setBusy(false);
  }
}

function stopAll() {
  try { elAudio.pause(); } catch{}
  try { elAudio.currentTime = 0; } catch{}
  status("(stopp)");
}

// ====== events ======
btnGen?.addEventListener("click", doGenerate);
btnPlay?.addEventListener("click", doTTS);
btnStop?.addEventListener("click", stopAll);
