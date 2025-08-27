// functions/api/tts.js
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store"
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost({ env, request }) {
  const bad = (status, msg) => new Response(msg, { status, headers: CORS });

  try {
    if (!env.OPENAI_API_KEY) return bad(500, "OPENAI_API_KEY saknas.");

    const { text, voice = "alloy", speed = 1.0 } = await request.json().catch(() => ({}));
    if (!text || !text.trim()) return bad(400, "Ingen text.");

    // OpenAI TTS – ange språk för bättre svenskt uttal
    const payload = {
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      format: "mp3",
      language: "sv-SE",
      speed: Math.max(0.75, Math.min(1.25, Number(speed) || 1.0))
    };

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      return bad(res.status, "TTS error: " + msg);
    }

    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        ...CORS,
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buf.byteLength)
      }
    });
  } catch (e) {
    return bad(500, "TTS crash: " + String(e?.message || e));
  }
}
