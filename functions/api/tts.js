// functions/api/tts.js — GC v1.2
import { jsonResponse, corsHeaders, badRequest, serverError } from "./_utils.js";

/*
  Body (JSON):
  { "text": "…", "voice": "alloy|verse|coral", "speed": 1.0 }

  Svar (audio/mpeg)
*/

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return badRequest("Use POST", request);
  }
  if (!env.OPENAI_API_KEY) {
    return serverError("OPENAI_API_KEY missing (Cloudflare env)", request);
  }

  try {
    const { text = "", voice = "alloy", speed = 1.0 } = await request.json().catch(() => ({}));
    if (!text || text.trim().length < 2) {
      return badRequest("Missing text", request);
    }

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text,
        speed: Math.max(0.5, Math.min(2.0, Number(speed) || 1.0))
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      // skicka vidare fel som JSON
      return jsonResponse({ ok: false, error: "TTS error", detail: errText, status: res.status }, res.status, request);
    }

    // proxy:a ljudet som binary
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: corsHeaders(request, {
        "content-type": "audio/mpeg",
        "cache-control": "no-store"
      })
    });
  } catch (err) {
    return serverError(err, request);
  }
}
