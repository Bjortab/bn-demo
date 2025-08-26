import { serverError } from "./_utils.js";

export async function onRequest(context) {
  try {
    const { request, env } = context;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type" } });
    }
    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405 });
    }

    const { text = "", voice = "alloy", speed = 1.0 } = await request.json().catch(() => ({}));
    if (!env.OPENAI_API_KEY) return new Response("OPENAI_API_KEY missing", { status: 400 });

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text,
        format: "mp3",
        speed: Math.max(0.5, Math.min(2.0, Number(speed) || 1.0))
      })
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return new Response(t || "TTS error", { status: res.status, headers: { "Access-Control-Allow-Origin": "*" } });
    }

    // stream mp3 through
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return serverError(err);
  }
}
