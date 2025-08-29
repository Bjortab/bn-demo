// functions/api/generate.js  — Golden Copy (BN)
// Purpose: generate story text (NO TTS here)

import { corsHeaders, jsonResponse, badRequest, serverError } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return badRequest('Use POST', request);
  }

  try {
    // read body safely
    const body = await request.json().catch(() => ({}));
    const idea    = String(body.idea ?? '').trim();
    const level   = Number(body.level ?? 3);
    const minutes = Number(body.minutes ?? 5);

    if (!idea) return badRequest("saknar 'idea'", request);

    // token budget (safe ceiling; ~350–400 tok/min)
    const maxTokens = Math.max(400, Math.min(2200, Math.round(minutes * 380)));

    // style by level
    const LEVEL_STYLE = {
      1: 'väldigt mild, romantisk ton. Undvik explicita ord. Fokus på stämning och blickar.',
      2: 'sensuell men fortfarande mild. Hålla det subtilt, kroppsnära detaljer utan grova ord.',
      3: 'sensuell och intim. Naturligt flyt, svensk prosastil. Inga grova ord.',
      4: 'het och direkt. Tillåt ord som lem, vagina, våt, hård, men håll språket smakfullt.',
      5: 'mycket het vuxen erotik i lyssnarformat. Tydlig stegring och klimax. Undvik klyschor.',
    };
    const style = LEVEL_STYLE[level] ?? LEVEL_STYLE[3];

    const sys =
      `Du är en skicklig svensk berättare. Skriv en sammanhängande berättelse i jag-form, ` +
      `med naturligt flyt, varierad men enkel svenska och utan klyschor. ` +
      `Undvik upprepningar och bokstavliga översättningar. Håll scenen fokuserad. ` +
      `Ton: ${style}`;

    const user =
      `Idé: ${idea}\n` +
      `Mål-längd: ca ${minutes} minuter uppläst text.\n` +
      `Skriv allt som en enda scen med tydlig stegring och naturligt avslut.`;

    // OpenAI Responses API
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          { role: 'system', content: sys },
          { role: 'user',   content: user },
        ],
        max_output_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      // return details so we can see it in UI
      return serverError(`LLM ${res.status}: ${raw}`, request);
    }

    const data = await res.json();

    // Robust extraction (Responses API schemas may differ)
    let story = '';
    if (typeof data.output_text === 'string' && data.output_text.trim()) {
      story = data.output_text.trim();
    } else if (Array.isArray(data.output) && data.output.length > 0) {
      const first = data.output[0];
      if (first?.content?.[0]?.text) story = String(first.content[0].text).trim();
    }

    if (!story) return serverError('tomt svar från LLM', request);

    return jsonResponse({ ok: true, text: story }, 200, request);
  } catch (err) {
    return serverError(err, request);
  }
}
