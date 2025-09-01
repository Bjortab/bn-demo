// functions/api/tts.js
import { json, badRequest, serverError, corsHeaders } from '../_utils.js';

export const onRequestPost = async (context) => {
  try {
    const { request, env } = context;

    // Läs in API-nyckeln från Cloudflare
    const ELEVENLABS_API_KEY = env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) {
      return badRequest("Missing ELEVENLABS_API_KEY");
    }

    const data = await request.json();
    const { text, voice } = data;

    if (!text) {
      return badRequest("Missing text for TTS");
    }

    // Mappar rösterna
    const voices = {
      charlotte: "EXAVITQu4vr4xnSDxMaL", // <-- Voice ID för Charlotte
      antoni: "ErXwobaYiN019PkySvjV"     // <-- Voice ID för Antoni
    };

    const voiceId = voices[voice] || voices.charlotte;

    // Bygg request mot ElevenLabs
    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2", // 🔑 ser till att rösterna pratar svenska
        voice_settings: {
          stability: 0.4,          // lite variation
          similarity_boost: 0.8,   // bibehåller rösten
          style: 0.6,              // lite mer känsla
          use_speaker_boost: true
        }
      })
    });

    if (!ttsResponse.ok) {
      const err = await ttsResponse.text();
      console.error("ElevenLabs error:", err);
      return serverError("TTS generation failed: " + err);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength,
        ...corsHeaders,
      },
    });

  } catch (err) {
    console.error("TTS API error:", err);
    return serverError("TTS API failed: " + err.message);
  }
};
