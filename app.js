// app.js — GC v1.3 (SSE streaming)

const $ = (q) => document.querySelector(q);

// UI-refs
const elLevel   = $("#level");
const elLength  = $("#length");
const elVoice   = $("#voice");
const elTempo   = $("#tempo");
const elIdea    = $("#userIdea");
const btnGen    = $("#generateBtn");
const btnPlay   = $("#listenBtn");
const btnStop   = $("#stopBtn");
const elOut     = $("#output");
const elOk      = $("#apiok");

let audioEl = null;
let busy = false;

function setBusy(b) {
  busy = b;
  btnGen.disabled   = b;
  btnPlay.disabled  = b;
  btnStop.disabled  = b;
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const ok  = res.ok;
    if (elOk) elOk.textContent = ok ? "ok" : "fail";
  } catch {
    if (elOk) elOk.textContent = "fail";
  }
}
checkHealth();

// Läs val i UI
function readParams() {
  return {
    level: Number(elLevel?.value ?? 3),
    minutes: Number(document.querySelector('input[name="len"]:checked')?.value ?? 5),
    voice: elVoice?.value || "alloy",
    tempo: Number(elTempo?.value ?? 1.0)
  };
}

// Hjälp: robust SSE-tolkning (OpenAI Responses stream)
function parseSSEChunk(raw, onDelta) {
  // Delas upp på event (tomrad mellan)
  const parts = raw.split("\n\n");
  for (const p of parts) {
    const lines = p.split("\n").filter(Boolean);
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload);
        // Vanliga typer i Responses-SSE: response.output_text.delta / message.delta etc.
        const t = obj?.type || "";
        if (t.endsWith(".delta")) {
          const delta = obj?.delta ?? obj?.text ?? "";
          if (delta) onDelta(delta);
        } else if (t === "response.completed") {
          // Ignorera – servern stänger ändå strömmen
        } else if (typeof obj?.text === "string") {
          onDelta(obj.text);
        }
      } catch {
        // hoppa över felaktig rad
      }
    }
  }
}

async function generate() {
  if (busy) return;
  setBusy(true);
  elOut.textContent = "(genererar...)";

  const { level, minutes } = readParams();
  const idea = (elIdea?.value || "").trim();

  // 1) Försök STREAM först
  try {
    const res = await fetch("/api/generate?stream=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea, level, minutes })
    });

    if (res.ok && res.headers.get("content-type")?.includes("text/event-stream")) {
      elOut.textContent = "";
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        parseSSEChunk(buffer, (delta) => {
          elOut.textContent += delta;
        });
        // Håll inte på att växa buffer ohämmat: spara bara sista “ofullständiga” eventet
        const lastGap = buffer.lastIndexOf("\n\n");
        if (lastGap > 0) buffer = buffer.slice(lastGap + 2);
      }

      if (!elOut.textContent.trim()) {
        elOut.textContent = "(tomt)";
      }
      setBusy(false);
      return;
    }

    // Om inte SSE – fall tillbaka till non-stream
    const txt = await res.text();
    try {
      const data = JSON.parse(txt);
      if (data?.ok && data?.story) {
        elOut.textContent = data.story;
      } else {
        elOut.textContent = "(kunde inte generera)";
      }
    } catch {
      elOut.textContent = "(fel vid generering)";
    }
  } catch (e) {
    // 2) Fallback helt (non-stream direkt)
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea, level, minutes })
      });
      const data = await res.json().catch(() => ({}));
      elOut.textContent = data?.story || "(fel vid generering)";
    } catch {
      elOut.textContent = "(fel vid generering)";
    }
  } finally {
    setBusy(false);
  }
}

// TTS – oförändrat (anropa /api/tts med elOut.textContent)
async function speak() {
  if (busy) return;
  const text = elOut.textContent.trim();
  if (!text) return;

  setBusy(true);
  try {
    const { voice, tempo } = readParams();
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, voice, speed: tempo })
    });
    if (!res.ok) throw new Error("TTS error");
    const blob = await res.blob();
    (audioEl ||= document.querySelector("#audio")).src = URL.createObjectURL(blob);
    await audioEl.play().catch(() => {});
  } catch {
    // tyst fel i demo
  } finally {
    setBusy(false);
  }
}

function stopAudio() {
  try { audioEl?.pause(); } catch {}
}

btnGen?.addEventListener("click", generate);
btnPlay?.addEventListener("click", speak);
btnStop?.addEventListener("click", stopAudio);
