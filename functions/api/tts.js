// functions/api/tts.js
import { corsHeaders } from './_utils.js';

/**
 * BN TTS (Cloudflare Pages Functions)
 * Input (POST JSON):
 *   { text: string, voice?: 'alloy'|'verse'|'coral', speed?: number }
 * Output:
 *   audio/mpeg (MP3) – binär ström redo att spela i <audio> i frontend
 */
export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  try {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Use POST' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    const { text, voice = 'alloy', speed = 1.0 } =
      await request.json().catch(() => ({}));

    if (!text || !String(text).trim()) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing text' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY missing (Cloudflare env)' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    // Tillåtna röster (lägg gärna till fler här när vi vill)
    const allowedVoices = new Set(['alloy', 'verse', 'coral']);
    const chosenVoice = allowedVoices.has(String(voice)) ? String(voice) : 'alloy';

    // OpenAI TTS (MP3)
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',   // stabil och snabb; byt vid behov
        voice: chosenVoice,
        input: String(text),
        format: 'mp3',
        speed: Number.isFinite(+speed) ? Math.max(0.5, Math.min(2.0, +speed)) : 1.0
      })
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => res.statusText);
      return new Response(JSON.stringify({ ok: false, error: errTxt }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    // Returnera binärt MP3 till klienten
    const audioBuf = await res.arrayBuffer();
    return new Response(audioBuf, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        ...corsHeaders(request)
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
    });
  }
}
