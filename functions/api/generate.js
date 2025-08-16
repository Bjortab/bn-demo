export async function onRequestPost(ctx) {
  const { env, request } = ctx;
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 });
  }

  // --- Läs in payload ---
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }

  const ideaRaw = (body.idea ?? '').trim();
  const minutes = Math.max(2, Math.min(10, Number(body.minutes || 5)));
  const spice   = Math.max(1, Math.min(5, Number(body.spice || 2)));
  const voice   = (body.voice || 'alloy').trim().toLowerCase();
  const readAloud = !!body.readAloud;

  if (!ideaRaw) {
    return Response.json({ error: 'Ingen idé inskriven.' }, { status: 400 });
  }

  // --- Prompt med innehållsregler ---
  const sys = `
Du skriver en sensuell, samtyckande ljudnovell mellan vuxna.
Inga minderåriga, inget tvång, inget våld. Språket får vara explicit men inte grafiskt eller våldsamt.
Nivåer: 1=mjuk, 2=mild, 3=tydligt sensuellt, 4=explicit (ej grafiskt), 5=mest explicit (icke-grafiskt, respektfullt).
Skriv på svenska. Längd ungefär ${170*minutes} ord (~${minutes} min). Nivå: ${spice}.
Utgå från idén: ${ideaRaw}
Avsluta utan cliffhanger. Returnera endast berättelsen (ingen rubrik, ingen metadata).`.trim();

  // --- Hjälpare för att extrahera text från olika OpenAI-svar ---
  function pickText(json) {
    // responses API: output_text
    if (typeof json?.output_text === 'string' && json.output_text.trim()) {
      return json.output_text.trim();
    }
    // responses API: output[].content[].text
    try {
      const out = json?.output?.[0]?.content?.find?.(c => c.type === 'output_text' || c.type === 'text');
      if (out?.text?.trim()) return out.text.trim();
      if (typeof out === 'string' && out.trim()) return out.trim();
    } catch {}
    // chat-style (fallback)
    try {
      const t = json?.choices?.[0]?.message?.content;
      if (typeof t === 'string' && t.trim()) return t.trim();
    } catch {}
    return '';
  }

  // --- Generera text ---
  const textRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      input: sys
    })
  });

  if (!textRes.ok) {
    const t = await textRes.text().catch(()=> '');
    return Response.json({ error: `OpenAI text error: ${t}` }, { status: 502 });
  }

  const textJson = await textRes.json().catch(()=> ({}));
  const story = pickText(textJson);

  if (!story) {
    return Response.json({ error: 'Textgenereringen gav tomt svar. Försök igen med en annan formulering.' }, { status: 502 });
  }

  const excerpt = story.slice(0, 550) + (story.length > 550 ? ' …' : '');

  // --- Om ingen uppläsning efterfrågas, returnera bara texten ---
  if (!readAloud) {
    return Response.json({ excerpt });
  }

  // --- TTS ---
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
    const t = await ttsRes.text().catch(()=> '');
    return Response.json({ error: `OpenAI TTS error: ${t}` }, { status: 502 });
  }

  const buf = await ttsRes.arrayBuffer();
  const bytes = new Uint8Array(buf);

  return Response.json({
    excerpt,
    audio: { data: Array.from(bytes) }
  });
}
