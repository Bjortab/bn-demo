// app.js – Golden Copy v1.3
const $ = (q) => document.querySelector(q);

// UI
const elLevel   = $("#level");
const elLength  = $("#length");
const elVoice   = $("#voice");
const elTempo   = $("#tempo");
const elIdea    = $("#userIdea");
const elOut     = $("#output");
const btnGen    = $("#generateBtn");
const btnPlay   = $("#listenBtn");
const btnStop   = $("#stopBtn");
const elAudio   = $("#audio");

// API-bas (Cloudflare Pages)
const BASE = location.origin + "/api";

// Helfunktioner
function setBusy(b) {
  btnGen.disabled  = b;
  btnPlay.disabled = b;
  btnStop.disabled = b;
}

function print(msg) {
  elOut.textContent = msg;
}

function seconds(s) {
  return new Promise((res) => setTimeout(res, s * 1000));
}

async function checkHealth() {
  try {
    const res = await fetch(BASE + "/health");
    const isOk = res.ok;
    const el = document.getElementById("apiok");
    if (el) el.textContent = isOk ? "ok" : "fail";
  } catch {
    const el = document.getElementById("apiok");
    if (el) el.textContent = "fail";
  }
}

function readForm() {
  const minutes = Number(document.querySelector('input[name="length"]:checked')?.value || "5");
  return {
    idea: (elIdea.value || "").trim(),
    level: Number(elLevel.value || "3"),
    minutes,
    voice: (elVoice.value || "alloy").trim(),
    tempo: Number(elTempo.value || "1"),
  };
}

// Robust JSON-läsare som även fångar textfel
async function safeJson(res) {
  const raw = await res.text();
  try { return { ok: true, value: JSON.parse(raw), raw }; }
  catch { return { ok: false, raw }; }
}

function fetchWithTimeout(url, opts = {}, ms = 60000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort("timeout"), ms);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(id));
}

// ===== GENERERA =====
btnGen?.addEventListener("click", async () => {
  const form = readForm();
  if (!form.idea) {
    print("(skriv en idé…)");
    return;
  }

  setBusy(true);
  print("(genererar …)");

  try {
    const res = await fetchWithTimeout(BASE + "/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    }, 90000);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[generate] http error", res.status, body);
      print("(kunde inte generera – prova igen)");
      return;
    }

    const parsed = await safeJson(res);
    if (!parsed.ok) {
      console.error("[generate] invalid JSON:", parsed.raw);
      print("(fel vid generering)");
      return;
    }

    const data = parsed.value;
    if (!data?.ok || !data?.text) {
      console.error("[generate] bad payload:", data);
      print("(fel vid generering)");
      return;
    }

    // Skriv ut berättelsen
    elOut.textContent = data.text;

  } catch (err) {
    console.error("[generate] exception", err);
    if (String(err).includes("timeout")) {
      print("(timeout mot server – prova igen)");
    } else {
      print("(fel vid generering)");
    }
  } finally {
    setBusy(false);
  }
});

// ===== TTS =====
let currentTts = null;

btnPlay?.addEventListener("click", async () => {
  const text = elOut.textContent?.trim();
  if (!text) {
    print("(ingen text att läsa)");
    return;
  }

  setBusy(true);
  print("Hämtar röst …");

  try {
    // avbryt ev pågående
    if (currentTts) { currentTts.abort(); currentTts = null; }

    const ctrl = new AbortController();
    currentTts = ctrl;

    const res = await fetchWithTimeout(BASE + "/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        voice: elVoice.value || "alloy",
        speed: Number(elTempo.value || "1"),
      }),
      signal: ctrl.signal,
    }, 90000);

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      console.error("[tts] http error", res.status, msg);
      print("(kunde inte spela upp)");
      return;
    }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    elAudio.src = url;
    await elAudio.play().catch((e)=> {
      console.error("[tts] play err", e);
      print("(kunde inte starta uppspelning)");
    });

    print("Klar.");

  } catch (err) {
    console.error("[tts] exception", err);
    print("(fel vid uppspelning)");
  } finally {
    setBusy(false);
  }
});

btnStop?.addEventListener("click", () => {
  try { elAudio.pause(); } catch {}
});

// Init
checkHealth();
