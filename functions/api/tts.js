// functions/api/tts.js
export async function onRequestPost(ctx) {
  try {
    const { request, env } = ctx;
    const apiKey = env.OPENAI_API_KEY; // vi kör TTS via OpenAI
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), { status: 500 });
    }

    const body = await request.json();
    let { text, voice = 'alloy', preview = false } = body || {};

    if (typeof text !== 'string') text = '';
    text = text.trim();

    if (!text) {
      return new Response(
        JSON.stringify({ error: { code: 'empty_string', message: "Invalid 'input': empty string." } }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    // Begränsa längd vid förhandslyssning (snabbt, ~10 sek)
    // och gör en rimlig hårdgräns även för full uppläsning
    const MAX_PREVIEW_CHARS = 900;   // ca 8–12 sek
    const MAX_FULLREAD_CHARS = 3200; // ~30–45 sek beroende på text

    if (preview && text.length > MAX_PREVIEW_CHARS) {
      text = text.slice(0, MAX_PREVIEW_CHARS);
    } else if (!preview && text.length > MAX_FULLREAD_CHARS) {
      text = text.slice(0, MAX_FULLREAD_CHARS);
    }

    // OpenAI TTS
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',      // kostnadseffektiv
        voice,                         // alloy, verse, aria, etc.
        input: text,
        format: 'mp3',                 // liten fil
        sample_rate: 22050             // lite mindre, snabbare
      })
    });

    if (!resp.ok) {
      const err = await safeJson(resp);
      return new Response(
        JSON.stringify({ error: { code: 'openai_tts_failed', status: resp.status, details: err }}),
        { status: 502, headers: { 'content-type': 'application/json' } }
      );
    }

    const arrayBuf = await resp.arrayBuffer();
    return new Response(arrayBuf, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': preview ? 'no-store' : 'public, max-age=60'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: { code: 'tts_crash', message: String(e) } }), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }
}

async function safeJson(r) {
  try { return await r.json(); } catch { return await r.text().catch(()=>''); }
}
