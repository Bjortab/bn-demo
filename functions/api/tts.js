// functions/api/tts.js
import { corsHeaders, jsonResponse, serverError, sha256 } from "./_utils.js";

const DEFAULT_VOICES = {
  alloy: "21m00Tcm4TlvDq8ikWAM",  // byt till dina riktiga voice IDs
  verse: "EXAVITQu4vr4xnSDxMaL",
  coral: "ErXwobaYiN019PkySvjV",
};

export async function onRequestOptions({ request }) {
  return new Response("", { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice = "alloy", tempo = 1.0, templateId = "-", version = 1, name = "" } =
      await request.json().catch(() => ({}));

    if (!text || !String(text).trim()) return jsonResponse({ ok: false, error: "Ingen text." }, 400, request);
    if (!env.BN_AUDIO) return jsonResponse({ ok: false, error: "Saknar R2-binding BN_AUDIO." }, 500, request);
    if (!env.ELEVENLABS_API_KEY) return jsonResponse({ ok: false, error: "Saknar ELEVENLABS_API_KEY." }, 500, request);

    let clean = String(text).replace(/[\u0000-\u0008\u000B-\u001F]/g, "").trim();
    const MAX_CHARS = 6000;
    if (clean.length > MAX_CHARS) clean = clean.slice(0, MAX_CHARS) + "…";

    const vKey = (voice || "alloy").toLowerCase();
    const tKey = Number(tempo || 1.0).toFixed(2);
    const fullKey = await sha256(`${vKey}|${tKey}|${templateId}|v${version}|${(name||"").toLowerCase()}|${clean.slice(0,256)}`);
    const objectKey = `v1/${vKey}/${tKey}/${templateId}/v${version}/${fullKey}.mp3`;

    const head = await env.BN_AUDIO.head(objectKey);
    if (head) {
      const obj = await env.BN_AUDIO.get(objectKey);
      if (obj) {
        return new Response(obj.body, {
          status: 200,
          headers: {
            ...corsHeaders(request),
            "Content-Type": "audio/mpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
            "ETag": head.httpEtag || `"${fullKey}"`,
          },
        });
      }
    }

    const VOICE_ID = env.ELEVENLABS_VOICE_ID || DEFAULT_VOICES[vKey] || DEFAULT_VOICES.alloy;
    const payload = {
      text: clean,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.82,
        style: 0.55,
        use_speaker_boost: true
      },
    };

    const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify(payload),
    });

    if (!elRes.ok) {
      const errTxt = await elRes.text().catch(() => "");
      return jsonResponse({ ok: false, error: "ElevenLabs TTS-fel", status: elRes.status, detail: errTxt }, 502, request);
    }

    const audioBuf = await elRes.arrayBuffer();

    await env.BN_AUDIO.put(objectKey, audioBuf, {
      httpMetadata: { contentType: "audio/mpeg", cacheControl: "public, max-age=31536000, immutable" },
    });

    return new Response(audioBuf, {
      status: 200,
      headers: {
        ...corsHeaders(request),
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": `"${fullKey}"`,
      },
    });
  } catch (err) { return serverError(err, request); }
}
