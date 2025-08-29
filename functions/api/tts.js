// functions/api/tts.js — GC v2.3 (OpenAI TTS, enkel längdskydd)
import { corsHeaders, jsonResponse, serverError, badRequest } from "./_utils.js";

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice } = await request.json();
    if (!text || !text.trim()) return badRequest("Ingen text till TTS", request);

    // skydda mot superlånga inputs (OpenAI kan 500:a på allt för långt)
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

    if (!r.ok) {
      const errTxt = await r.text().catch(()=>"");
      return serverError(`OpenAI TTS-fel: ${r.status} ${errTxt}`, request);
    }

    const buf = await r.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        ...corsHeaders(request, { "content-type": "audio/mpeg" }),
        "content-disposition": "inline; filename=voice.mp3",
      }
    });
  } catch (err) {
    return serverError(err, request);
  }
}
