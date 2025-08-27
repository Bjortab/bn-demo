// functions/api/tts.js
import { corsHeaders, json, badRequest, serverError } from "./_utils.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return badRequest("Use POST");

  try {
    if (!env?.OPENAI_API_KEY) return badRequest("OPENAI_API_KEY saknas");

    const body = await request.json().catch(() => ({}));
    let text = (body?.text || "").toString().trim();
    const voice = body?.voice || "alloy";
    const speed = Number(body?.speed || 1.0);

    if (!text) return badRequest("Ingen text för TTS");

    // Dela upp i bitar (ca 800 tecken = lagom för TTS)
    const chunks = [];
    while (text.length > 0) {
      chunks.push(text.slice(0, 800));
      text = text.slice(800);
    }

    const audioBuffers = [];

    for (const chunk of chunks) {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice,
          input: chunk,
          speed,
          format: "mp3",
        }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        return json({ ok: false, error: "TTS fel", detail: err }, res.status);
      }

      const buf = await res.arrayBuffer();
      audioBuffers.push(buf);
    }

    // Slå ihop alla chunks till en Blob
    const totalLength = audioBuffers.reduce((a, b) => a + b.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of audioBuffers) {
      merged.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    return new Response(merged, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
