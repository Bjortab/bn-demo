export async function onRequestPost(ctx){
  const { env, request } = ctx;
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Missing OPENAI_API_KEY', { status: 500 });

  const { text = '', voice = 'alloy' } = await request.json();
  if (!text.trim()) return new Response('No text', { status: 400 });

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method:'POST',
    headers:{
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model:'gpt-4o-mini-tts',
      voice, input:text, format:'mp3'
    })
  });

  if (!res.ok){
    return new Response(await res.text(), { status: 502 });
  }

  const buf = await res.arrayBuffer();
  return new Response(buf, {
    headers:{
      'Content-Type':'audio/mpeg',
      'Cache-Control':'no-store'
    }
  });
}
