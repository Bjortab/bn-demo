// functions/api/generate.js  — Golden Copy (OpenRouter primary + retries + fallbacks)
// kräver ./_utils.js i samma katalog
import { corsHeaders, jsonResponse, badRequest, serverError } from './_utils.js';

/** ----------- Hjälp ---------- **/

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), ms);
  return {
    signal: ctrl.signal,
    clear: () => clearTimeout(t),
  };
}

function pick(arr, n) {
  if (!Array.isArray(arr) || !arr.length) return [];
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

async function loadLexicon(request) {
  try {
    const url = new URL('/lexicon.json', request.url);
    const res = await fetch(url.toString(), { headers: { 'accept': 'application/json' } });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

function buildSystemPrompt(level, minutes, lexicon) {
  // gemensamma regler
  const base =
    `Skriv en sammanhängande berättelse på svenska i jag-form. ` +
    `Naturligt flyt, inga listor eller rubriker, undvik upprepningar och klyschor. ` +
    `Variera meningslängd, använd sensoriska detaljer (ljud, beröring, andning). ` +
    `Avsluta först när scenen känns avrundad. Unik formulering – undvik att återanvända fraser. ` +
    `Cirka ${minutes} min lyssning.`;

  if (Number(level) >= 5) {
    // nivå 5 – explicit
    const phrases = (lexicon?.L5_explicit || []);
    const inject = pick(phrases, Math.min(10, Math.max(6, (phrases.length / 20) | 0 || 8)));
    return (
      base + ' Stil: rå, explicit erotik (samtycke och vuxna). ' +
      'Uppmuntra tydliga beskrivningar och klimax. ' +
      (inject.length
        ? `Integrera några av följande uttryck naturligt där de passar: ${inject.join(', ')}. `
        : '')
    );
  }

  // nivå 3 – sensuell
  return (
    base +
    ' Stil: sensuell och intim, utan grova könsord. Fokusera på känslor, beröring, andning och närhet. '
  );
}

function buildUserPrompt(idea, level, minutes) {
  return [
    `Idé: ${idea}`,
    `Nivå: ${level}`,
    `Längd: ${minutes} min.`,
    `Skapa en enda scen med naturlig dialog där det passar. Undvik upprepningar.`
  ].join('\n');
}

/** ----------- Källor (providers) ---------- **/

async function callOpenRouter(request, env, sys, user, maxTokens, timeoutMs, modelOverride) {
  if (!env.OPENROUTER_API_KEY) throw new Error('saknar OPENROUTER_API_KEY');
  const { signal, clear } = withTimeout(timeoutMs);
  const model = modelOverride || 'gryphe/mythomax-l2-13b';

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        // Rekommenderat av OpenRouter (hjälper deras routing/ratelimits)
        'HTTP-Referer': new URL('/', request.url).toString(),
        'X-Title': 'Blush Narratives'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user }
        ],
        max_tokens: maxTokens,
        temperature: 0.9,
        presence_penalty: 0.3,
        frequency_penalty: 0.2,
      })
    });

    const raw = await res.text();
    if (!res.ok) {
      // en del leverantörer returnerar JSON fel – skicka upp strängen som detail
      throw new Error(`openrouter_${res.status}: ${raw.slice(0, 400)}`);
    }
    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('openrouter: tomt svar');
    return { provider: 'openrouter', model, text };
  } finally {
    clear();
  }
}

async function callMistral(env, sys, user, maxTokens, timeoutMs) {
  if (!env.MISTRAL_API_KEY) throw new Error('saknar MISTRAL_API_KEY');
  const { signal, clear } = withTimeout(timeoutMs);

  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        'Authorization': `Bearer ${env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user }
        ],
        max_tokens: maxTokens,
        temperature: 0.9
      })
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(`mistral_${res.status}: ${raw.slice(0, 400)}`);
    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('mistral: tomt svar');
    return { provider: 'mistral', model: 'mistral-large-latest', text };
  } finally {
    clear();
  }
}

async function callOpenAI(env, sys, user, maxTokens, timeoutMs) {
  if (!env.OPENAI_API_KEY) throw new Error('saknar OPENAI_API_KEY');
  const { signal, clear } = withTimeout(timeoutMs);

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal,
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          { role: 'system', content: sys },
          { role: 'user', content: user }
        ],
        max_output_tokens: maxTokens,
        temperature: 0.9
      })
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(`openai_${res.status}: ${raw.slice(0, 400)}`);
    const data = JSON.parse(raw);
    const text = data?.output?.[0]?.content?.[0]?.text?.trim()
      ?? data?.output_text?.trim();
    if (!text) throw new Error('openai: tomt svar');
    return { provider: 'openai', model: 'gpt-4o-mini', text };
  } finally {
    clear();
  }
}

/** ----------- Route ---------- **/

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const { idea, level, minutes } = await request.json();
    if (!idea || !minutes) {
      return badRequest('saknas fält: idea/minutes', request);
    }
    const lvl = Number(level || 3);
    const mins = Math.max(3, Math.min(15, Number(minutes) || 5));

    // ungefärliga tokens för hela berättelsen (svenska ~4 chars/token => 100 ord ≈ 150 tokens)
    const approxTokens = Math.round(mins * 380);
    const maxTokens = Math.max(600, Math.min(approxTokens, 2200));

    // ladda lexikon (för nivå 5)
    const lexicon = await loadLexicon(request);

    const sys = buildSystemPrompt(lvl, mins, lexicon);
    const user = buildUserPrompt(idea, lvl, mins);

    const started = Date.now();

    // Preferens: nivå 5 → OpenRouter direkt, nivå 3 → OpenRouter (tills vidare).
    // 1) OpenRouter med retry
    let lastErr = null;
    if (env.OPENROUTER_API_KEY) {
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const primaryModel =
            lvl >= 5 ? 'neversleep/llama-3.1-nemotron-70b-instruct' : 'gryphe/mythomax-l2-13b';
          const or = await callOpenRouter(request, env, sys, user, maxTokens, 60_000, primaryModel);
          return jsonResponse(
            { ok: true, text: or.text, provider: or.provider, model: or.model, ms: Date.now() - started },
            200,
            request
          );
        } catch (err) {
          lastErr = String(err?.message || err);
          // kort ryckig backoff
          await new Promise(r => setTimeout(r, 350 * attempt));
        }
      }
    }

    // 2) Fallback Mistral
    if (env.MISTRAL_API_KEY) {
      try {
        const mi = await callMistral(env, sys, user, maxTokens, 55_000);
        return jsonResponse(
          { ok: true, text: mi.text, provider: mi.provider, model: mi.model, note: 'fallback:mistral', ms: Date.now() - started },
          200,
          request
        );
      } catch (err) {
        lastErr = String(err?.message || err);
      }
    }

    // 3) Sista utväg: OpenAI
    if (env.OPENAI_API_KEY) {
      try {
        const oa = await callOpenAI(env, sys, user, maxTokens, 55_000);
        return jsonResponse(
          { ok: true, text: oa.text, provider: oa.provider, model: oa.model, note: 'fallback:openai', ms: Date.now() - started },
          200,
          request
        );
      } catch (err) {
        lastErr = String(err?.message || err);
      }
    }

    // Kunde inte generera – tala om för fronten att prova igen
    return jsonResponse(
      {
        ok: false,
        error: 'alla_backends_fel',
        detail: lastErr || 'ingen provider tillgänglig',
        advice:
          (lvl >= 5)
            ? 'OpenRouter kan vara överbelastad. Försök igen om några minuter på nivå 5.'
            : 'Försök igen om en stund.',
      },
      502,
      request
    );

  } catch (err) {
    return serverError(err, request);
  }
}
