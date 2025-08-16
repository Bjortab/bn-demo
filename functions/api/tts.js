// Cloudflare Pages Function: POST /api/tts
// Returnerar MP3 med OpenAI TTS (gratis test-röster hos dig)

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice } = await request.json();

    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "empty_text" }), { status: 400 });
    }

    const OPENAI_API_KEY = env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "missing_openai_key" }), { status: 500 });
    }

    const body = {
      model: "gpt-4o-mini-tts",        // OpenAI TTS-modell
      voice: voice || "alloy",         // fallback
      input: text
    };

    const resp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: "openai_tts_failed", status: resp.status, details: errText?.slice(0, 500) }),
        { status: 502 }
      );
    }

    const arrayBuf = await resp.arrayBuffer();
    return new Response(arrayBuf, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "tts_exception", message: String(e) }), { status: 500 });
  }
}
