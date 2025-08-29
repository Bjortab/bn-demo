// functions/api/tts.js
// GC v2.2 — OpenAI TTS, enkel SSML-tolk om provider saknar SSML

import { jsonResponse, corsHeaders, badRequest, serverError } from "./_utils.js";

const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";
const OPENAI_TTS_MODEL = "gpt-4o-mini-tts"; // röster: alloy, verse, coral (mfl)

function stripSSML(ssml) {
  // Mycket enkel SSML→text: ta bort taggar, ersätt <break> med punkt
  return String(ssml || "")
    .replace(/<break[^>]*time="(\d+ms|\d+s)"[^>]*\/>/gi, ". ")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return badRequest("Use POST", request);

  try {
    if (!env.OPENAI_API_KEY) return serverError("saknar OPENAI_API_KEY", request);

    const body = await request.json().catch(() => ({}));
    const voice = String(body?.voice || "alloy").toLowerCase();
    const tempo = Number(body?.tempo || 1.0);
    const useSSML = Boolean(body?.ssml);
    let text = String(body?.text || "");

    if (!text) return badRequest("saknar text", request);

    // Om SSML – prova att förenkla om provider saknar SSML
    if (useSSML) text = stripSSML(text);

    // Justera tempo via enkla heuristiker (OpenAI TTS saknar tempo-param)
    // Vi "simulerar" långsammare genom att lägga till extra punkter/komman
    if (tempo < 1.0) {
      text = text.replace(/([,!?:;])\s/g, "$1.. ");
    } else if (tempo > 1.1) {
      text = text.replace(/\.\.\s/g, ". ");
    }

    const res = await fetch(OPENAI_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice,
        input: text,
        format: "mp3"
      })
    });

    const buf = await res.arrayBuffer();
    if (!res.ok) {
      let detail = "";
      try { detail = new TextDecoder().decode(buf); } catch { detail = `${res.status}`; }
      return serverError(`tts_${res.status}: ${detail}`, request);
    }

    return new Response(buf, {
      status: 200,
      headers: {
        ...corsHeaders(request),
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store"
      }
    });

  } catch (err) {
    return serverError(err, request);
  }
}
