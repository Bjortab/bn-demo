// functions/api/generate.js — GC v2.1
import { corsHeaders, jsonResponse, badRequest, serverError } from './_utils.js';
import { applyFilters } from './filters.js';

const OR_URL   = 'https://openrouter.ai/api/v1/chat/completions';
const OR_MODEL = 'mistralai/mixtral-8x7b-instruct';
const TIMEOUT_MS  = 120000;
const MAX_RETRIES = 5;

function levelStyle(level, lexHints = []) {
  const common = [
    'Skriv på idiomatisk svenska med korrekt grammatik (tempus, pronomen, kongruens).',
    'Tydlig båge: förväntan → stegring → avslut/efterspel.',
    'Undvik klyschor (som “ceder och rök”), och undvik upprepningar.',
    'Inga fysiska motsägelser: två personer kan inte göra två omöjliga saker exakt samtidigt.',
    'Första person (“jag”) om inte idén säger annat.',
  ];
  const densLow  = 'Lexikonfraser sparsamt.';
  const densHigh = 'Använd lexikonfraser där de passar, undvik upprepning.';

  if (level >= 5) {
    return [
      ...common,
      'Nivå 5 (explicit): Direkt och erotisk utan våld. Grova ord tillåtna där de passar (t.ex. "kuk", "våt", "vagina", "bröstvårta").',
      densHigh,
      ...(lexHints.length ? ['Lexikon (inspiration): ' + lexHints.join(' | ')] : []),
      'Avsluta scenen med ett tydligt efterspel.'
    ].join(' ');
  }
  if (level === 4) {
    return [
      ...common,
      'Nivå 4 (het, ej grovt): Het vuxenprosa, ord som lem, vagina, våt, hård är ok, men undvik nedsättande/grovt språk.',
      densHigh,
      'Avrunda scenen naturligt.'
    ].join(' ');
  }
  if (level === 3) {
    return [
      ...common,
      'Nivå 3 (sensuell): Heta scener utan explicita könsord. Fokus på beröring, andning, blickar, kyssar.',
      densLow,
      'Mjukt efterspel.'
    ].join(' ');
  }
  if (level === 2) {
    return [
      ...common,
      'Nivå 2 (antydande): Sensuell, antydande, ingen explicit anatomi.',
      densLow
    ].join(' ');
  }
  // level 1
  return [
    ...common,
    'Nivå 1 (romantisk): Fokus på känslor, närhet och blickar. Ingen kroppslig explicithet.',
    densLow
  ].join(' ');
}

function targetWords(min) {
  const perMin = 130;
  return Math.max(200, Math.round(min * perMin));
}
function buildUser({ idea, level, minutes }) {
  const words = targetWords(minutes);
  return [
    `Idé: ${idea}`,
    `Omfattning: ~${words} ord.`,
    'Skriv som en sammanhängande berättelse, inga listor.'
  ].join('\n');
}
function withTimeout(ms) {
  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(new Error('timeout')), ms);
  return { signal: ac.signal, cancel: () => clearTimeout(t) };
}
async function callOpenRouter(env, { sys, user, maxTokens, referer = 'https://bn-demo01.pages.dev' }) {
  if (!env.OPENROUTER_API_KEY) throw new Error('saknar OPENROUTER_API_KEY');
  let lastErr;
  for (let i = 1; i <= MAX_RETRIES; i++) {
    const { signal, cancel } = withTimeout(TIMEOUT_MS);
    try {
      const res = await fetch(OR_URL, {
        method: 'POST',
        signal,
        headers: {
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type':  'application/json',
          'HTTP-Referer':  referer,
          'X-Title':       'Blush Narratives'
        },
        body: JSON.stringify({
          model: OR_MODEL,
          temperature: 0.85,
          top_p: 0.9,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: sys },
            { role: 'user',   content: user }
          ]
        })
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        if ([429,500,502,503,504].includes(res.status)) {
          lastErr = new Error(`openrouter_${res.status}: ${txt || 'retry'}`);
          await new Promise(r => setTimeout(r, 300 * i));
          continue;
        }
        throw new Error(`openrouter_${res.status}: ${txt}`);
      }
      const data = await res.json();
      const out  = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
      cancel();
      if (!out) throw new Error('tomt svar från modell');
      return out;
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      if (msg.includes('timeout') || e?.name === 'AbortError' || msg.includes('network')) {
        await new Promise(r => setTimeout(r, 300 * i));
        continue;
      }
      break;
    }
  }
  throw lastErr || new Error('okänt OpenRouter-fel');
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('saknar JSON', request);

    const { idea = '', level = 3, minutes = 5, lexHints = [] } = body;
    if (!idea || typeof idea !== 'string') return badRequest('saknar idé', request);

    const sys  = levelStyle(Number(level), Array.isArray(lexHints) ? lexHints : []);
    const user = buildUser({ idea, level, minutes });
    const maxT = Math.min(3500, Math.max(800, Math.round(targetWords(minutes) * 1.6)));

    const raw = await callOpenRouter(env, { sys, user, maxTokens: maxT });

    const text = applyFilters(raw, { level, persons: 2 });
    return jsonResponse({ ok: true, text }, 200, request);
  } catch (err) {
    return serverError(err, request);
  }
}

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request) });
}
export async function onRequestGet({ request }) {
  return jsonResponse({ ok: true, service: 'generate', at: Date.now() }, 200, request);
}
