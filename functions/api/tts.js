import { json, corsHeaders, serverError, badRequest } from './_utils.js';

export default async function onRequest({ request, env }) {
  try {
    if (request.method !== 'POST') return badRequest('POST only');
    const { text = '', voice = 'verse', speed = 1.0 } = await request.json().catch(() => ({}));
    if (!text.trim()) return json({ ok: false, error: 'Ingen text' }, 400, corsHeaders(request));
    if (!env.OPENAI_API_KEY) return json({ ok: false, error: 'OPENAI_API_KEY saknas' }, 500);

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice, // verse = kvinna, coral = man, alloy = neutral
        input: text.slice(0, 120000),
        speed: Math.max(0.8, Math.min(1.25, Number(speed) || 1.0)),
        format: 'wav'
      })
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      return json({ ok: false, error: msg || 'TTS error' }, res.status, corsHeaders(request));
    }

    // Returnera som blob-URL via Cloudflare R2? För demo: base64 data URL.
    const arr = await res.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(arr)));
    const url = `data:audio/wav;base64,${b64}`;
    return json({ ok: true, url }, 200, corsHeaders(request));
  } catch (e) {
    return serverError(e);
  }
}
