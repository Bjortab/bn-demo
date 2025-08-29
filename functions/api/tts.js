// functions/api/tts.js — GC (Azure sv-SE först + OpenAI fallback + uttalsfix)
import { corsHeaders, jsonResponse, badRequest, serverError } from './_utils.js';

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request) });
}

function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

// mappa tempo [0.8..1.25] till prosody rate
function tempoToRate(tempo) {
  const t = clamp(Number(tempo) || 1.0, 0.8, 1.25);
  if (t < 0.95) return 'slow';
  if (t > 1.15) return 'x-fast';
  if (t > 1.05) return 'fast';
  return 'medium';
}

// Uttalsfix via SSML/IPA (Azure stöder <phoneme>)
function ssmlSafe(text) {
  // markera några problemord
  const replacements = [
    // [regex, ssml]
    [/\bkuk\b/gi, `<phoneme alphabet="ipa" ph="kʉːk">kuk</phoneme>`],
    [/\bvagina\b/gi, `<phoneme alphabet="ipa" ph="vaˈgiːna">vagina</phoneme>`],
    [/\bklitoris\b/gi, `<phoneme alphabet="ipa" ph="ˈkliːtorɪs">klitoris</phoneme>`],
    [/\borgasm\b/gi, `<phoneme alphabet="ipa" ph="ʊrˈɡasm">orgasm</phoneme>`],
    [/\bLotta\b/g, `<phoneme alphabet="ipa" ph="ˈlɔtːa">Lotta</phoneme>`],
    [/\bLisa\b/g, `<phoneme alphabet="ipa" ph="ˈliːsa">Lisa</phoneme>`],
  ];
  let t = text;
  for (const [re, rep] of replacements) t = t.replace(re, rep);
  // lägg in pauser efter punkt/ny rad för bättre andning
  t = t.replace(/([.!?])(\s+)/g, `$1<break time="200ms" />$2`);
  return t;
}

function buildSSML(text, { voice = 'female', tempo = 1.0 } = {}) {
  const rate = tempoToRate(tempo);
  const voiceName = (voice === 'male') ? 'sv-SE-MattiasNeural' : 'sv-SE-SofieNeural';
  const body = ssmlSafe(text);
  return `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0" xml:lang="sv-SE">
  <voice name="${voiceName}">
    <prosody rate="${rate}">
      ${body}
    </prosody>
  </voice>
</speak>`;
}

async function callAzureTTS(env, text, voice, tempo) {
  if (!env.AZURE_TTS_KEY || !env.AZURE_TTS_REGION) throw new Error('saknar Azure TTS credentials');
  const ssml = buildSSML(text, { voice, tempo });
  const url = `https://${env.AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env.AZURE_TTS_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-48khz-192kbitrate-mono-mp3',
    },
    body: ssml,
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`azure_tts_${res.status}: ${raw.slice(0,200)}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

// Fallback till OpenAI (ingen SSML, men vi skickar redan bra skiljetecken från generate-cleanup)
async function callOpenAITTS(env, text, voice) {
  if (!env.OPENAI_API_KEY) throw new Error('saknar OPENAI_API_KEY');
  const chosenVoice = voice === 'male' ? 'verse' : 'alloy';
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice: chosenVoice,
      format: 'mp3',
    })
  });
  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`openai_tts_${res.status}: ${raw.slice(0,200)}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice, tempo } = await request.json();
    if (!text) return badRequest('Ingen text skickad till TTS.', request);

    // 1) Azure först (bättre svenska)
    try {
      const mp3 = await callAzureTTS(env, text, voice, tempo);
      return new Response(mp3, {
        status: 200,
        headers: {
          ...corsHeaders(request),
          'content-type': 'audio/mpeg',
          'cache-control': 'no-store',
        },
      });
    } catch (e) {
      // fortsätt till fallback
    }

    // 2) OpenAI fallback
    const mp3 = await callOpenAITTS(env, text, voice);
    return new Response(mp3, {
      status: 200,
      headers: {
        ...corsHeaders(request),
        'content-type': 'audio/mpeg',
        'cache-control': 'no-store',
      },
    });

  } catch (err) {
    return serverError(err, request);
  }
}
