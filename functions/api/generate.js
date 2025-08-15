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
    const { prompt, minutes = 5, spice = 3 } = await request.json();

    if (!env.OPENAI_API_KEY) {
      return new Response('OPENAI_API_KEY missing', { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (!prompt || typeof prompt !== 'string') {
      return new Response('Bad request', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system",
          content: `Skriv en svensk erotisk berättelse som känns varm och mänsklig. Längd ca ${Math.round(minutes*170)} ord. Snusk-nivå: ${spice}/5. Undvik riktiga namn och persondata.` },
        { role: "user", content: prompt }
      ]
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const e = await r.text();
      return new Response(`OpenAI error: ${e}`, { status: r.status, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    return new Response(JSON.stringify({ text }), {
      headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }
    });
  } catch (err) {
    return new Response(`Server error: ${err}`, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
