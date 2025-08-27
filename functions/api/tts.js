// functions/api/tts.js
import { corsHeaders, serverError, badRequest } from './_utils.js';

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "API key saknas (Cloudflare env)" }), {
        status: 500, headers: corsHeaders
      });
    }

    let payload;
    try { payload = await request.json(); } catch {
      return badRequest("POST body saknas eller inte JSON");
    }

    const text = (payload.text || "").toString().slice(0, 12000);
    const voice = (payload.voice || "alloy").toString();
    const speed = Math.max(0.6, Math.min(1.6, Number(payload.speed || 1.0)));

    // OpenAI TTS (audio/speech)
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice, input: text, format: "mp3",
        speed
      })
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return new Response(JSON.stringify({ ok: false, error: txt || res.statusText }), {
        status: res.status || 500, headers: corsHeaders
      });
    }

    // streama mp3 tillbaka
    return new Response(res.body, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg" }
    });
  } catch (e) {
    return serverError(e?.message || "TTS-fel");
  }
}
