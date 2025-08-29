// functions/api/tts.js — GC v2.4 (robust TTS + rätt content-type)
import { corsHeaders, jsonResponse, serverError, badRequest } from "./_utils.js";

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice } = await request.json().catch(()=> ({}));
    if (!text || !text.trim()) return badRequest("Ingen text till TTS", request);

    // Skydda mot för långa inputs (OpenAI 500:ar hellre än svarar snyggt)
    const trimmed = text.slice(0, 5500);
    const chosenVoice = voice || "alloy";

    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: chosenVoice,
        input: trimmed,
        format: "mp3"
      })
    });

    // Om OpenAI svarar med JSON istället för ljud (t.ex. fel), exponera felet tydligt
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !ct.startsWith("audio/")) {
      const errText = await r.text().catch(()=> "");
      return serverError(`OpenAI TTS-fel: ${r.status} ${errText}`, request);
    }

    const buf = await r.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        // Viktigt: *inte* JSON här – sätt ren audio + CORS
        "content-type": "audio/mpeg",
        ...corsHeaders(request, { "cache-control": "no-store" }),
        "content-disposition": "inline; filename=voice.mp3",
        "accept-ranges": "bytes"
      }
    });
  } catch (err) {
    return serverError(err, request);
  }
}
