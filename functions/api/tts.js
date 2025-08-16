// functions/api/tts.js
// TTS via OpenAI + robust metod/CORS-hantering

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function errorJson(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export async function onRequest({ request, env }) {
  const { method } = request;

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (method !== "POST") {
    return errorJson(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const { text = "", voice = "alloy", speed = 1.0 } = await request.json()
      .catch(() => ({}));

    if (!text || !text.trim()) {
      return errorJson(400, { ok: false, error: "empty_text" });
    }

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return errorJson(500, { ok: false, error: "missing_openai_key" });
    }

    // OpenAI TTS (gpt-4o-mini-tts) → mp3
    const resp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: text,
        voice,
        speed: Math.max(0.5, Math.min(2.0, Number(speed) || 1.0)),
        format: "mp3",
      }),
    });

    if (!resp.ok) {
      const msg = await resp.text().catch(() => "");
      return errorJson(502, { ok: false, error: "openai_tts_error", detail: msg });
    }

    const audio = await resp.arrayBuffer();

    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        ...CORS,
      },
    });
  } catch (err) {
    return errorJson(500, { ok: false, error: "server_error", detail: String(err) });
  }
}
