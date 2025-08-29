// functions/api/tts.js
import { corsHeaders, jsonResponse, serverError } from './_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice } = await request.json();
    if (!text) return serverError("Ingen text skickad till TTS.");

    const chosenVoice = voice || "alloy"; // standard om ingen valts

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
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
      const err = await res.text();
      return serverError(`OpenAI TTS-fel: ${err}`);
    }

    // Returnera ljudet i base64
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString("base64");

    return jsonResponse({ ok: true, audio: base64Audio }, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
  } catch (err) {
    return serverError(err.message);
  }
}
