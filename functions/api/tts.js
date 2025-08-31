// functions/api/tts.js
import { corsHeaders, jsonResponse, serverError } from "./_utils.js";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders(new Request(""), {}) });
}

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice } = await request.json().catch(() => ({}));
    if (!text || typeof text !== "string") {
      return jsonResponse({ ok: false, error: "Ingen text skickad till TTS." }, 400);
    }

    const chosenVoice = voice || "alloy";

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: chosenVoice,
        input: text,
        format: "mp3",
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return jsonResponse(
        { ok: false, error: "OpenAI TTS-fel", detail: errText || res.statusText },
        res.status || 502
      );
    }

    const buf = await res.arrayBuffer();
    const b64 =
      typeof Buffer !== "undefined"
        ? Buffer.from(buf).toString("base64")
        : btoa(String.fromCharCode(...new Uint8Array(buf)));

    return jsonResponse({ ok: true, audio: b64 });
  } catch (err) {
    return serverError("Fel i TTS: " + (err?.message || String(err)));
  }
}
