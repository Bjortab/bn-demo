// functions/api/tts.js

function corsHeaders(request, extra = {}) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-expose-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra
  };
}
function jsonResponse(payload, status = 200, request, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(request, extra)
  });
}
function badRequest(msg = "bad request", request) {
  return jsonResponse({ ok: false, error: msg }, 400, request);
}
function serverError(err = "server error", request) {
  const detail = typeof err === "string" ? err : (err?.message || "error");
  return jsonResponse({ ok: false, error: detail }, 500, request);
}

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice } = await request.json();
    if (!text) return badRequest("ingen text till TTS", request);

    const chosenVoice = voice || "alloy";
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: chosenVoice,
        input: text,
        format: "mp3"
      })
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      return serverError(`OpenAI TTS-fel: ${res.status} ${errTxt}`, request);
    }

    const arrayBuffer = await res.arrayBuffer();
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        ...corsHeaders(request),
        "content-type": "audio/mpeg"
      }
    });
  } catch (err) {
    return serverError(err, request);
  }
}
