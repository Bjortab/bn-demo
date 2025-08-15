export const onRequestOptions = () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice = "alloy" } = await request.json();

    if (!env.OPENAI_API_KEY) {
      return new Response('OPENAI_API_KEY missing', { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (!text) {
      return new Response('Bad request', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text,
        format: "mp3"
      })
    });

    if (!r.ok) {
      const e = await r.text();
      return new Response(`OpenAI TTS error: ${e}`, { status: r.status, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    return new Response(r.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(`Server error: ${err}`, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
