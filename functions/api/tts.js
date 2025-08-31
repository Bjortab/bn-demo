// Enkel TTS via OpenAI (mp3). Kräver OPENAI_API_KEY i Cloudflare.
export async function onRequestOptions({ request }) {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }});
}
export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENAI_API_KEY) return new Response('saknar OPENAI_API_KEY', { status: 400 });
    const body = await request.json().catch(()=>null);
    if (!body || !body.text) return new Response('saknar text', { status: 400 });

    const voice = (body.voice || 'alloy');
    const text = String(body.text).slice(0, 20000);

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, format: 'mp3', input: text })
    });
    if (!res.ok) {
      const t = await res.text().catch(()=> '');
      return new Response(`OpenAI TTS fel: ${t}`, { status: res.status });
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': 'audio/mpeg',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    return new Response(String(e?.message || e), { status: 500 });
  }
}
