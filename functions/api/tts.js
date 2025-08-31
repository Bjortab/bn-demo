// functions/api/tts.js
// Robust TTS med korrekt hantering av POST / OPTIONS / GET

const CORS_BASE_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-expose-headers": "content-type",
  "cache-control": "no-store",
};

// Hjälp: JSON-respons
function jsonResponse(payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_BASE_HEADERS, ...extra },
  });
}

// Preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_BASE_HEADERS,
  });
}

// GET (för snabbtest)
export async function onRequestGet() {
  return jsonResponse({ ok: true, hint: "POST { text, voice } till /api/tts" });
}

// POST = huvudfunktionen
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    let { text, voice } = body || {};
    if (!text || typeof text !== "string") {
      return jsonResponse({ ok: false, error: "Ingen text skickad till TTS." }, 400);
    }

    // Sanering + längdgräns
    text = text.trim().replace(/[\uD800-\uDFFF]/g, "");
    const MAX_CHARS = 4500;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + "…";
    }

    const v = (voice || "alloy").toLowerCase();
    const voiceMap = { alloy: "alloy", verse: "verse", coral: "coral" };
    const chosenVoice = voiceMap[v] || "alloy";

    const OPENAI_API_KEY = env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return jsonResponse({ ok: false, error: "Saknar OPENAI_API_KEY." }, 500);
    }

    // Anropa OpenAI TTS
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: chosenVoice,
        input: text,
        format: "mp3",
      }),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text().catch(() => "");
      return jsonResponse({ ok: false, error: "TTS-provider fel", status: ttsRes.status, detail: errText }, 502);
    }

    const audioBuf = await ttsRes.arrayBuffer();

    return new Response(audioBuf, {
      status: 200,
      headers: {
        ...CORS_BASE_HEADERS,
        "content-type": "audio/mpeg",
      },
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: "TTS-intern", detail: String(err?.message || err) }, 500);
  }
}
