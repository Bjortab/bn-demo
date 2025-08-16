export async function onRequestPost(ctx) {
  const { env, request } = ctx;
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response('Missing OPENAI_API_KEY', { status: 500 });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response('Bad JSON', { status: 400 }); }

  const { idea = '', minutes = 5, spice = 2, voice = 'alloy', readAloud = false } = body;

  // Prompt-kontroll (vuxna, samtycke, ej grafiskt våld etc.)
  const safety = `
Du skriver en sensuell, samtyckande ljudnovell mellan vuxna.
Inga minderåriga, inget tvång, inget våld. Språket får vara explicit men inte grafiskt eller våldsamt.

Snusk-nivå:
1 = mjukt romantiskt.
2 = mild med varm stämning.
3 = tydligt sensuellt.
4 = explicit (ej grafiskt).
5 = mest explicit (icke-grafiskt, fortfarande respektfullt och samtyckande).

Skriv på svenska. Längd: cirka ${Math.max(2, Math.min(10, Number(minutes)))} minuter (~${170*minutes} ord).
Använd nivå ${Math.max(1, Math.min(5, Number(spice)))}. Idé: ${idea}
Avsluta utan cliffhanger.

Returnera endast berättelsetexten.`;

  // === Textgenerering (Responses API, JSON) ===
  const textRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      input: safety
    })
  });

  if (!textRes.ok) {
    const t = await textRes.text();
    return new Response(`OpenAI text error: ${t}`, { status: 502 });
  }

  const textJson = await textRes.json();
  const story = (textJson.output_text || '').trim();
  const excerpt = story.slice(0, 550) + (story.length > 550 ? ' …' : '');

  if (!readAloud) {
    return Response.json({ excerpt });
  }

  // === TTS (mp3) via /tts endpoint eller direkt här ===
  const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: voice || 'alloy',
      input: story,
      format: 'mp3'
    })
  });

  if (!ttsRes.ok) {
    const t = await ttsRes.text();
    return new Response(`OpenAI TTS error: ${t}`, { status: 502 });
  }

  const buf = await ttsRes.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // Skicka både utdrag + ljud (som byte-array)
  return Response.json({
    excerpt,
    audio: { data: Array.from(bytes) } // frontend gör Blob av detta
  });
}
