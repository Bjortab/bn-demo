// functions/api/tts.js
import { corsHeaders, jsonResponse, serverError } from './_utils.js';

const ELEVEN_API = "https://api.elevenlabs.io/v1/text-to-speech";

// Exempel på röster (du kan byta till andra ID:n från ElevenLabs dashboard)
const VOICES = {
  alloy: "pNInz6obpgDQGcFmaJgB",     // neutral
  nova: "EXAVITQu4vr4xnSDxMaL",      // kvinnlig
  verse: "TxGEqnHWrfWFTfGW9XjX"      // manlig
};

// Maxlängd på text som skickas till ElevenLabs
const MAX_CHARS = 5000;

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice = "alloy", tempo = 1.0 } = await request.json();

    if (!text || text.trim().length === 0) {
      return jsonResponse({ ok: false, error: "Ingen text till TTS" }, 400, request);
    }

    if (!env.ELEVENLABS_API_KEY) {
      return jsonResponse({ ok: false, error: "Saknar ELEVENLABS_API_KEY i Cloudflare" }, 500, request);
    }

    // Städa texten & kapa om den är för lång
    let clean = text.replace(/\s+/g, " ").trim();
    if (clean.length > MAX_CHARS) clean = clean.slice(0, MAX_CHARS);

    // Välj röst-ID
    const voiceId = VOICES[voice] || VOICES.alloy;

    // Skapa payload för ElevenLabs
    const body = {
      text: clean,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.5,
        use_speaker_boost: true
      }
    };

    // Skicka till ElevenLabs API
    const res = await fetch(`${ELEVEN_API}/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({ ok: false, error: "ElevenLabs API fel", details: errText }, 500, request);
    }

    const audio = await res.arrayBuffer();

    return new Response(audio, {
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
