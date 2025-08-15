// functions/api/generate.js
// Skapar berättelsetext + TTS-ljud (mp3 data-URL) i ett anrop.

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { OPENAI_API_KEY } = env;
    if (!OPENAI_API_KEY) {
      return json({ error: 'OPENAI_API_KEY saknas i Cloudflare Pages → Settings → Variables' }, 500);
    }

    const body    = await request.json();
    const prompt  = (body?.prompt ?? '').trim();
    const minutes = Number(body?.minutes ?? 5);
    const spice   = Number(body?.spice ?? 3);
    const voiceIn = (body?.voice ?? 'alloy').toLowerCase();

    if (!prompt) return json({ error: 'prompt (string) krävs' }, 400);

    const allowedVoices = ['alloy', 'verse', 'aria', 'sage', 'narrator'];
    const safeVoice = allowedVoices.includes(voiceIn) ? voiceIn : 'alloy';

    const targetWords = Math.max(60, Math.min(2000, Math.round(minutes * 170)));
    const temperature = Math.min(1.0, Math.max(0, (spice - 1) / 4));

    // --- TEXT ---
    const textResp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          {
            role: 'system',
            content:
`Du skriver en engagerande, sensuell men inte explicit berättelse på svenska.
Skriv naturligt talad prosa som lämpar sig att läsas upp. Undvik listor.
Mål-längd ungefär ${targetWords} ord.`
          },
          { role: 'user', content: prompt }
        ],
        temperature
      })
    });

    if (!textResp.ok) {
      const e = await safeText(textResp);
      return json({ error: `Text-API fel: ${textResp.status} ${e}` }, 500);
    }

    const textData = await textResp.json();
    const storyText = (textData.output_text ?? '').trim();
    if (!storyText) return json({ error: 'Tomt textsvar från modellen' }, 500);

    // --- TTS ---
    const ttsResp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: safeVoice,
        input: storyText,
        format: 'mp3'
      })
    });

    if (!ttsResp.ok) {
      const e = await safeText(ttsResp);
      // returnera åtminstone text om TTS felar
      return json({ text: storyText, audio: null, voice: safeVoice, warning: `TTS-API fel: ${ttsResp.status} ${e}` }, 200);
    }

    const audioArrayBuffer = await ttsResp.arrayBuffer();
    const audioBase64 = arrayBufferToBase64(audioArrayBuffer);
    const dataUrl = `data:audio/mpeg;base64,${audioBase64}`;

    return json({ text: storyText, audio: dataUrl, voice: safeVoice }, 200);
  } catch (err) {
    return json({ error: `Serverfel: ${err?.message ?? String(err)}` }, 500);
  }
}

/* Hjälp-funktioner */
function arrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
async function safeText(res) { try { return await res.text(); } catch { return '<no body>'; } }
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
