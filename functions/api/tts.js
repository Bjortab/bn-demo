// functions/api/tts.js — GC v2
import { corsHeaders, jsonResponse, badRequest, serverError } from './_utils.js';

function ttsSanitize(raw, level = 3) {
  let t = raw;
  t = t.replace(/\bfitta\b/gi, 'mellan mina ben');
  t = t.replace(/\bkuk\b/gi, 'lem');
  t = t.replace(/\bknulla\b/gi, 'älska');
  t = t.replace(/\bsprutade\b/gi, 'kom');
  if (level === 3) {
    t = t.replace(/\bbröstvårta\b/gi, 'bröst').replace(/\bvåt\b/gi, 'varm');
  }
  return t;
}

const TTS_URL   = 'https://api.openai.com/v1/audio/speech';
const TTS_MODEL = 'gpt-4o-mini-tts';
const MAX_RETRIES = 3;
const TIMEOUT_MS  = 45000;

function withTimeout(ms) {
  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(new Error('timeout')), ms);
  return { signal: ac.signal, cancel: () => clearTimeout(t) };
}

async function callTTS(env, { text, voice = 'alloy', level = 3 }) {
  if (!env.OPENAI_API_KEY) throw new Error('saknar OPENAI_API_KEY');
  let lastErr;
  for (let i = 1; i <= MAX_RETRIES; i++) {
    const { signal, cancel } = withTimeout(TIMEOUT_MS);
    try {
      const res = await fetch(TTS_URL, {
        method: 'POST',
        signal,
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({
          model: TTS_MODEL,
          voice: voice || 'alloy',
          input: ttsSanitize(text, level),
          format: 'mp3'
        })
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        if ([429,500,502,503,504].includes(res.status)) {
          lastErr = new Error(`tts_${res.status}: ${txt || 'retry'}`);
          await new Promise(r => setTimeout(r, 300 * i));
          continue;
        }
        throw new Error(`tts_${res.status}: ${txt}`);
      }
      const buf = await res.arrayBuffer();
      cancel();
      return new Uint8Array(buf);
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      if (msg.includes('timeout') || e?.name === 'AbortError' || msg.includes('network')) {
        await new Promise(r => setTimeout(r, 300 * i));
        continue;
      }
      break;
    }
  }
  throw lastErr || new Error('okänt TTS-fel');
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('saknar JSON', request);

    const { text = '', voice = 'alloy', level = 3 } = body;
    if (!text) return badRequest('ingen text till TTS', request);

    const audio = await callTTS(env, { text, voice, level });
    return new Response(audio, {
      status: 200,
      headers: {
        ...corsHeaders(request),
        'content-type': 'audio/mpeg',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'accept-ranges': 'bytes'
      }
    });
  } catch (err) {
    return serverError(err, request);
  }
}

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request) });
}
export async function onRequestGet({ request }) {
  return jsonResponse({ ok: true, service: 'tts', at: Date.now() }, 200, request);
}
