// functions/api/generate.js — Golden Copy v4
// Provider: OpenRouter (primär) → Mistral → OpenAI
// Funktioner: prompt-intensitet, nivåstyrning, lexicon nivå 5, kändis/fullt-namn-filter,
// retries/backoff, [SLUT]-tagg, provider+modell i responsen

import { corsHeaders, jsonResponse, badRequest, serverError } from './_utils.js';

// ---------- Hjälp: namn/kändis-skydd ----------
const CELEB_HINTS = [
  // kort lista (servern kör generiskt skydd – kompletterar klientskyddet)
  'madonna','beyonce','taylor swift','prinsessan madeleine','elon musk','greta thunberg',
  'zlatan','juanan','rihanna','brad pitt','angelina jolie','billie eilish'
];

function looksLikeFullName(s) {
  // två ord som börjar på versal och har minst 2+2 bokstäver (enkelt heuristik)
  const m = s.match(/\b[A-ZÅÄÖ][a-zåäöéè]{2,}\s+[A-ZÅÄÖ][a-zåäöéè]{2,}\b/);
  return !!m;
}
function mentionsCelebrity(s) {
  const low = s.toLowerCase();
  return CELEB_HINTS.some(w => low.includes(w));
}

// ---------- Hjälp: intensitets-score från prompt ----------
const INTENT_EXPLICIT = [
  // Lätt lista för scoring. (Du kan fylla på fler i takt med testning)
  'knulla','slicka','suga','våt','hård','orgasm','stån','stön',
  'kåt','naken','sperma','sprut','lem','bröst','fitta','kuk','röv'
];
function scorePromptExplicitness(txt) {
  const low = (txt || '').toLowerCase();
  let score = 0;
  for (const w of INTENT_EXPLICIT) {
    const re = new RegExp(`\\b${w}`, 'g');
    const hits = (low.match(re) || []).length;
    score += hits;
  }
  // Begränsa 0..10
  return Math.max(0, Math.min(10, score));
}

// ---------- Hjälp: hämta lexicon (nivå 5) ----------
async function fetchLexicon(origin) {
  try {
    const res = await fetch(`${origin}/lexicon.json`, { headers: { 'accept': 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
function pickPhrases(lex, level) {
  if (!lex) return [];
  const keysPerLevel = {
    1: 'L1_romantic',
    2: 'L2_sensual',
    3: 'L3_sensual_plus',
    4: 'L4_hot_soft',
    5: 'L5_explicit'
  };
  const key = keysPerLevel[level] || 'L3_sensual_plus';
  const arr = lex[key];
  if (!Array.isArray(arr) || arr.length === 0) return [];
  // Välj några slumpmässiga för variation
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(8, shuffled.length));
}

// ---------- Systemprompt-generator ----------
function systemFor(level, intensity, extraPhrases) {
  // Bas-ton efter nivå
  const tones = {
    1: 'romantisk, varsam, inga kroppsliga detaljer – fokus på känslor, stämning, blickar och närhet.',
    2: 'sensuell och antydande, milda kroppsliga detaljer men utan grova ord.',
    3: 'sensuell+, vuxen prosa, tydlig kroppslighet men mjukt språk. Undvik grova ord.',
    4: 'het, direkt kroppslighet, tillåt anatomiska ord, men undvik grovt och vulgärt språk.',
    5: 'explicit vuxenprosa. Tillåt explicita ord och tydliga handlingar på ett stilrent sätt.'
  };
  const baseTone = tones[level] || tones[3];

  // Intensitets-översättning (0..10) -> “styrord”
  // Ju högre, desto friare och snabbare stegring.
  const spice =
    intensity >= 8 ? 'hög intensitet, snabb stegring och tydliga scener' :
    intensity >= 5 ? 'medelhög intensitet, naturlig stegring' :
                     'låg till medel intensitet, långsam stegring';

  const phraseGuide =
    extraPhrases && extraPhrases.length
      ? `Du kan väva in några av följande fraser naturligt (valfritt, använd sparsamt & endast om de passar): ${extraPhrases.join(' • ')}.`
      : '';

  // Stilregler (svenska + flyt + slut)
  const common = `
- Språk: svenska. Var korrekt i grammatik och tempushantering.
- Undvik upprepningar och klyschor.
- Inga svordomar.
- Följ kontinuitet (ingen kan vara på två ställen samtidigt, inga omöjliga kroppsliga kombinationer).
- Avsluta berättelsen med en tydlig avrundning och skriv till sist exakt taggen: [SLUT].
  `.trim();

  return `
Du är en skicklig erotikförfattare. Skriv i första person (jag-form). Håll en varm, naturlig berättarröst.
Nivå: ${baseTone}
Intensitet: ${spice}.
${phraseGuide}
${common}
`.trim();
}

// ---------- Provider-mappning ----------
function pickProvider(level) {
  // 1–3: också via OpenRouter (billiga öppna modeller) tills vidare.
  // 4–5: OpenRouter “heta” modeller.
  // Du kan byta modellnamn senare i config.
  if (level >= 4) {
    return {
      provider: 'openrouter',
      model: 'nousresearch/hermes-3-llama-70b', // het & duktig på prosa
    };
  }
  return {
    provider: 'openrouter',
    model: 'meta-llama/llama-3.1-70b-instruct', // bra svensk prosa, billig
  };
}

// ---------- Retry/backoff ----------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetries(fn, max = 5) {
  let attempt = 0;
  let lastErr = null;
  while (attempt < max) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      const isRetryable = (e.status && (e.status === 429 || e.status >= 500)) || e.retry === true;
      if (!isRetryable) throw e;
      const backoff = Math.min(2000 * Math.pow(1.6, attempt), 8000);
      await sleep(backoff + Math.random() * 400);
      attempt++;
    }
  }
  throw lastErr;
}

// ---------- Kallare ----------
async function callOpenRouter(env, model, sys, user, max_tokens) {
  const key = env.OPENROUTER_API_KEY;
  if (!key) {
    const err = new Error('OPENROUTER_API_KEY saknas');
    err.retry = false;
    throw err;
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://bn-demo01.pages.dev',
      'X-Title': 'BlushNarratives'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ],
      max_tokens,
      temperature: 0.9,
      top_p: 0.95
    })
  });
  if (res.status === 402) {
    const e = new Error('openrouter_402');
    e.status = 402; e.retry = false;
    e.detail = await res.text();
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`openrouter_${res.status}`);
    e.status = res.status; e.retry = (res.status === 429 || res.status >= 500);
    e.detail = await res.text();
    throw e;
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const usedModel = data?.model || model;
  return { text: content, provider: 'openrouter', model: usedModel };
}

async function callMistral(env, sys, user, max_tokens) {
  const key = env.MISTRAL_API_KEY;
  if (!key) {
    const err = new Error('MISTRAL_API_KEY saknas');
    err.retry = false;
    throw err;
  }
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'mistral-large-latest',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ],
      max_tokens,
      temperature: 0.9,
      top_p: 0.95
    })
  });
  if (!res.ok) {
    const e = new Error(`mistral_${res.status}`);
    e.status = res.status; e.retry = (res.status === 429 || res.status >= 500);
    e.detail = await res.text();
    throw e;
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const usedModel = data?.model || 'mistral-large-latest';
  return { text: content, provider: 'mistral', model: usedModel };
}

async function callOpenAI(env, sys, user, max_tokens) {
  const key = env.OPENAI_API_KEY;
  if (!key) {
    const err = new Error('OPENAI_API_KEY saknas');
    err.retry = false;
    throw err;
  }
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ],
      max_output_tokens: max_tokens,
      temperature: 0.9,
      top_p: 0.95
    })
  });
  if (!res.ok) {
    const e = new Error(`openai_${res.status}`);
    e.status = res.status; e.retry = (res.status === 429 || res.status >= 500);
    e.detail = await res.text();
    throw e;
  }
  const data = await res.json();
  const content = data?.output?.[0]?.content?.[0]?.text || '';
  return { text: content, provider: 'openai', model: 'gpt-4o-mini' };
}

// ---------- API-handlar ----------
export async function onRequestPost({ request, env }) {
  try {
    const origin = request.headers.get('origin') || new URL(request.url).origin;

    const { idea = '', level = 3, minutes = 5 } = await request.json();

    // 1) Validering & filter
    if (!idea || typeof idea !== 'string') {
      return badRequest('Tom idé');
    }
    if (looksLikeFullName(idea) || mentionsCelebrity(idea)) {
      return badRequest('Din prompt nämner en identifierbar person. Använd endast förnamn/roller.');
    }

    // 2) Intensitets-score från prompt + nivå
    const promptScore = scorePromptExplicitness(idea);
    // Basintensitet per nivå
    const baseByLevel = { 1: 1, 2: 3, 3: 4, 4: 6, 5: 8 };
    const base = baseByLevel[Number(level)] ?? 4;
    const targetIntensity = Math.max(0, Math.min(10, base + Math.floor(promptScore / 2)));

    // 3) Lexicon för nivå 5 (om finns)
    let lexPhrases = [];
    if (Number(level) === 5) {
      const lex = await fetchLexicon(origin);
      lexPhrases = pickPhrases(lex, 5);
    }

    // 4) System & user
    const sys = systemFor(Number(level), targetIntensity, lexPhrases);
    const wordsPerMin = 160; // ca
    const maxTokens = Math.max(400, Math.min(2400, Math.floor(minutes * wordsPerMin * 0.8)));

    const user = `
Skriv en sammanhängande berättelse på ${minutes} minuter lästempo (ca). Integrera idén organiskt utan uppräkningar.
Idé: ${idea}
Avrunda med en tydlig slutscen och skriv exakt taggen [SLUT] på sista raden.
`.trim();

    // 5) Provider → retry med fallback
    const { provider: primProv, model: primModel } = pickProvider(Number(level));

    let result = null;
    try {
      result = await withRetries((attempt) => callOpenRouter(env, primModel, sys, user, maxTokens), 5);
    } catch (e1) {
      // Fallback 1: Mistral
      try {
        result = await withRetries((attempt) => callMistral(env, sys, user, maxTokens), 4);
      } catch (e2) {
        // Fallback 2: OpenAI
        result = await withRetries((attempt) => callOpenAI(env, sys, user, maxTokens), 3);
      }
    }

    // 6) Säkerställ [SLUT]
    let text = (result?.text || '').trim();
    if (!/\[SLUT\]\s*$/i.test(text)) {
      text = `${text}\n\n[SLUT]`;
    }

    return jsonResponse(
      {
        ok: true,
        provider: result?.provider || 'unknown',
        model: result?.model || 'unknown',
        text
      },
      200,
      request
    );
  } catch (err) {
    return serverError(err, request);
  }
}

export async function onRequestOptions({ request }) {
  return new Response('ok', { status: 204, headers: corsHeaders(request) });
}
