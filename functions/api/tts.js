// functions/api/tts.js
// GC v1.1 – TTS via Audio Speech API med CORS
import { json, corsHeaders, badRequest, serverError } from "./_utils.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return badRequest("Use POST", request);
  if (!env.OPENAI_API_KEY) return serverError("OPENAI_API_KEY saknas i Cloudflare env", request);

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Ogiltig JSON i request body", request);
  }

  const text  = (body?.text ?? "").toString();
  const voice = (body?.voice ?? "alloy").toString();
  const speed = Number(body?.speed ?? 1.0);

  if (!text) return badRequest("text saknas", request);

  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text,
        speed: Math.max(0.5, Math.min(2.0, isNaN(speed) ? 1.0 : speed)),
        format: "mp3",
      }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      return json({ ok: false, error: "TTS error", detail: msg, status: res.status }, res.status, corsHeaders(request));
    }

    // Skicka vidare ljudet som stream, men med CORS
    const outHeaders = new Headers(corsHeaders(request));
    outHeaders.set("content-type", "audio/mpeg");
    outHeaders.set("cache-control", "no-store");

    return new Response(res.body, { status: 200, headers: outHeaders });
  } catch (err) {
    return serverError(err, request);
  }
}
