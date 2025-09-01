// functions/api/version.js
import { corsHeaders, jsonResponse } from './_utils.js';

export async function onRequestGet({ request, env }) {
  return jsonResponse({
    ok: true,
    bn: 'front',
    tts_engine: 'elevenlabs',
    has_kv: !!env.BN_AUDIO,
    has_eleven_key: !!env.ELEVENLABS_API_KEY
  }, 200, request);
}

export async function onRequestOptions({ request }) {
  return new Response('', { status: 204, headers: corsHeaders(request) });
}
