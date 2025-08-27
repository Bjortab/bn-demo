// BN generate – 5/10/15 min, svensk stil, anti-repetition
import { json, badRequest, serverError, corsHeaders } from './_utils.js';

const SYS_POWER = `
Du skriver erotiska berättelser på svenska.
Stilregler:
- Skriv naturlig svenska (inga engelska direktöversättningar).
- Undvik upprepningar och fyllnadsfraser. Variera verb, sinnesintryck och tempo.
- Följ "nivå": 3 = sensuell/romantisk (inget explicit språk); 5 = explicit (raka ord och sexhandlingar).
- Håll röd tråd och dramaturgi (början–bygg–klimax–efterklang). Inga sammanfattningar i slutet.
- Respektera längd (5/10/15 min) och leverera sammanhängande prosa utan listor.
`;

function tokensTarget(minutes = 5) {
  // 1 min ≈ 250–300 tecken uppläsning; vi tar textmängd för röstläge
  // Här skalar vi textlängd försiktigt för att undvika loopar.
  const baseChars = 1400;      // ≈ ~1,5–2 min tal
  const perMin = 900;          // extra per minut
  const m = Math.max(5, Math.min(15, Number(minutes)));
  const chars = baseChars + perMin * (m - 5);
  // Om din backend använder tokens: 1 token ~4 tecken
  return Math.round(chars / 4);
}

function levelHints(level) {
  if (Number(level) >= 5) {
    return `Använd explicit språk där det passar. Variera uttryck (synonymer) och undvik att upprepa samma fras.
Om könsord används, väv in dem i meningen så att flödet känns naturligt (inte som uppräkning).`;
  }
  return `Fokusera på sensuell närhet, kroppsspråk, andning och känsloläge. Undvik grovt språk.`;
}

export default async function onRequest({ request, env }) {
  if (request.method !== 'POST') return badRequest('Use POST');
  try {
    const { idea = '', level = 3, minutes = 5 } = await request.json().catch(() => ({}));

    const prompt = `
Mål-längd: ${minutes} minuter.
Nivå: ${level}.
${levelHints(level)}

Utgå från idén: """${(idea || 'Skapa en fristående scen.').slice(0, 1200)}"""

Skriv på svensk prosa (inga engelska låneord i uttryck som känns översatta).
Använd stycken (radbrytning mellan stycken). Inga rubriker, inga punktlistor.
Avsluta naturligt i scenen (ingen "slutsats").`;

    const max_tokens = tokensTarget(minutes);

    // OpenAI Responses API
    if (!env.OPENAI_API_KEY) return json({ ok: false, error: 'OPENAI_API_KEY saknas' }, 500);

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          { role: 'system', content: SYS_POWER },
          { role: 'user', content: prompt }
        ],
        max_output_tokens: max_tokens,
        temperature: Number(level) >= 5 ? 0.95 : 0.8,
        presence_penalty: 0.6,
        frequency_penalty: 0.6
      })
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      return json({ ok: false, error: errTxt || 'API-fel' }, res.status, corsHeaders(request));
    }
    const data = await res.json();

    // Resolutions: Responses schema
    let story = '';
    if (data.output && Array.isArray(data.output) && data.output.length) {
      const first = data.output[0];
      if (first.content && first.content.length) {
        const piece = first.content.find(p => p.type === 'output_text') || first.content[0];
        story = (piece.text || '').trim();
      }
    }
    if (!story && data.output_text) story = String(data.output_text).trim();

    return json({ ok: true, story }, 200, corsHeaders(request));
  } catch (e) {
    return serverError(e);
  }
}
