// functions/api/tts.js
import { corsHeaders, jsonResponse, badRequest, serverError } from './_utils.js';

const DEFAULT_VOICES = {
  // Byt till dina riktiga voice IDs från ElevenLabs
  alloy: '21m00Tcm4TlvDq8ikWAM',     // exempel
  charlotte: 'ELEVEN_VOICE_ID_CHARLOTTE', // byt
  erik: 'ELEVEN_VOICE_ID_ERIK',           // byt
};

export async function onRequestOptions({ request }) {
  return new Response('', { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice = 'alloy', tempo = 1.0, templateId = null, version = 'v1' } = await request.json().catch(() => ({}));
    if (!text || !text.trim()) return badRequest('Ingen text till TTS.', request);
    if (!env.ELEVENLABS_API_KEY) return jsonResponse({ ok: false, error: 'Saknar ELEVENLABS_API_KEY.' }, 500, request);

    // Rensa upp kontrolltecken etc.
    const clean = String(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    if (!clean) return badRequest('Tom/smutsig text efter städning.', request);

    // Tempo → prosody-speed via SSML, ElevenLabs ignorerar ibland det – vi låter servern bära parametern ändå
    const speed = Math.max(0.75, Math.min(1.5, Number(tempo) || 1.0));

    // Hämta voiceId
    const voiceId = DEFAULT_VOICES[voice] || voice; // tillåt att skicka direkt voiceId
    const modelId = 'eleven_multilingual_v2';       // svenska stöds

    const body = {
      model_id: modelId,
      voice_settings: { stability: 0.55, similarity_boost: 0.7, style: 0.4, use_speaker_boost: true },
      text: clean,
      // Tips: använd SSML för mer rytm (kan aktiveras via tts: { use_ssml: true } i din app senare)
    };

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      return serverError(`TTS-fel: HTTP ${res.status} ${errTxt || ''}`, request);
    }

    const audio = await res.arrayBuffer();

    const headers = {
      ...corsHeaders(request, { 'content-type': 'audio/mpeg' }),
      'content-disposition': 'inline; filename="bn-voice.mp3"',
      'cache-control': 'no-store',
    };
    return new Response(audio, { status: 200, headers });
  } catch (err) {
    return serverError(err, request);
  }
}
