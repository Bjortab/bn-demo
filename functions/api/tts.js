import { jsonResponse, corsHeaders, badRequest, serverError } from "./_utils.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return badRequest("Use POST", request);
  if (!env.OPENAI_API_KEY) return serverError("OPENAI_API_KEY saknas", request);

  try {
    const { text = "", voice = "verse", speed = 1.0 } = await request.json().catch(() => ({}));
    if (!text) return badRequest("Saknar 'text'", request);

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: text,
        voice,
        speed: Math.max(0.5, Math.min(2.0, Number(speed) || 1.0)),
        format: "mp3",
      }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "TTS error");
      return jsonResponse({ ok: false, error: msg }, res.status, corsHeaders(request));
    }

    return new Response(res.body, { status: 200, headers: { "content-type": "audio/mpeg", ...corsHeaders(request) } });
  } catch (e) {
    return serverError(e?.message || "TTS exception", request);
  }
}
