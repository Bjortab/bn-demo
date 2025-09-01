// functions/api/tts.js
import { corsHeaders, jsonResponse, serverError, sha256 } from './_utils.js';

// ======= KONFIG =======
const DEFAULT_VOICES = {
  // Byt till dina riktiga ElevenLabs-IDs när du vill
  // (du kan även skicka voice från frontend)
  female: 'EXAVITQu4vr4xnSDxMaL', // ex: "Charlotte" eller liknande
  male:   'pNInz6obpgDQGcFmaJgB', // ex: "Adam" eller liknande
};

const ELEVEN_MODEL = 'eleven_multilingual_v2';
const MAX_CHARS = 9_500;           // rejäl säkerhetsmarginal
const RETRIES = 2;                  // gör några få kontrollerade omförsök
const CACHE_TTL_SECONDS = 60 * 60;  // 1h cache i CF KV

export async function onRequestOptions({ request }) {
  return new Response('', { status: 204, headers: corsHeaders(request) });
}

export async function onRequestGet({ request }) {
  // enkel diagnos-endpoint
  return jsonResponse({ ok: true, tts: 'elevenlabs', model: ELEVEN_MODEL }, 200, request);
}

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice, templateId } = await request.json();

    if (!text || typeof text !== 'string') {
      return jsonResponse({ ok: false, error: 'ingen text till TTS' }, 400, request);
    }
    if (!env.ELEVENLABS_API_KEY) {
      return jsonResponse({ ok: false, error: 'saknar ELEVENLABS_API_KEY' }, 500, request);
    }
    if (!env.BN_AUDIO) {
      // KV-binding saknas – ge tydlig diagnos
      return jsonResponse({ ok: false, error: 'saknar KV-binding BN_AUDIO' }, 500, request);
    }

    // Sanera / trunkera text
    let clean = text.replace(/\u0000/g, '').trim();
    if (clean.length > MAX_CHARS) clean = clean.slice(0, MAX_CHARS);

    // Välj röst (tillåt explicit voice-id från klienten)
    const chosen = (voice && typeof voice === 'string' ? voice : '').trim()
      || DEFAULT_VOICES.female;

    // Nyckel för KV-cache baserat på (text + voice + templateId)
    const keyMaterial = `${ELEVEN_MODEL}::${chosen}::${templateId ?? ''}::${clean}`;
    const cacheKey = await sha256(keyMaterial);

    // KV: försök hämta
    const head = await env.BN_AUDIO.get(cacheKey, { type: 'arrayBuffer' });
    if (head) {
      return new Response(head, {
        status: 200,
        headers: {
          ...corsHeaders(request),
          'content-type': 'audio/mpeg',
          'cache-control': 'public, max-age=31536000, immutable',
          'x-bn-tts': 'elevenlabs-kv-hit',
          'etag': cacheKey,
        }
      });
    }

    // Annars hämta från ElevenLabs (med små omförsök)
    let audioBuf = null;
    let lastErr = null;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${chosen}`, {
          method: 'POST',
          headers: {
            'accept': 'audio/mpeg',
            'content-type': 'application/json',
            'xi-api-key': env.ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text: clean,
            model_id: ELEVEN_MODEL,
            voice_settings: {
              stability: 0.45,
              similarity_boost: 0.7,
              style: 0.4,
              use_speaker_boost: true
            }
          })
        });

        if (!res.ok) {
          const msg = await safeText(res);
          throw new Error(`elevenlabs_${res.status}: ${msg}`);
        }

        audioBuf = await res.arrayBuffer();
        break; // klart
      } catch (e) {
        lastErr = e;
        // liten backoff men inga rekursiva loopar
        if (attempt < RETRIES) await sleep(400 * (attempt + 1));
      }
    }

    if (!audioBuf) {
      return serverError(`TTS-fel: ${String(lastErr?.message || lastErr)}`, 502, request);
    }

    // Spara i KV (best-effort)
    try {
      await env.BN_AUDIO.put(cacheKey, audioBuf, {
        expirationTtl: CACHE_TTL_SECONDS,
        metadata: { voice: chosen, model: ELEVEN_MODEL, bytes: audioBuf.byteLength }
      });
    } catch (e) {
      // skriv bara logg – miss i cache ska inte fälla TTS
      console.warn('KV put miss:', e);
    }

    return new Response(audioBuf, {
      status: 200,
      headers: {
        ...corsHeaders(request),
        'content-type': 'audio/mpeg',
        'content-length': String(audioBuf.byteLength),
        'cache-control': 'public, max-age=31536000, immutable',
        'x-bn-tts': 'elevenlabs',
        'etag': cacheKey,
      }
    });
  } catch (err) {
    return serverError(err, 500, request);
  }
}

// ===== helpers =====
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function safeText(res) {
  try { return await res.text(); } catch { return '(no-body)'; }
}
