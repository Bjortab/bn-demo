// functions/api/generate.js  (GC v3)

// Små hjälpmetoder (vi använder lokala kopior för att undvika trasiga imports)
function corsHeaders(request, extra = {}) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-expose-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extra,
  };
}
function jsonResponse(payload, status = 200, request, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(request, extra),
  });
}
function badRequest(msg = 'bad request', request) {
  return jsonResponse({ ok: false, error: msg }, 400, request);
}
function serverError(err = 'server error', request) {
  const detail = (typeof err === 'string') ? err : (err?.message || 'error');
  return jsonResponse({ ok: false, error: detail }, 500, request);
}

// ---- konfiguration
const MISTRAL_URL = 'https://api.mistral.ai/v1/responses';
const MISTRAL_MODEL = 'mistral-large-latest';

// timeout-hjälp
function withTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(new Error('timeout')), ms);
  return {
    signal: c.signal,
    clear: () => clearTimeout(t)
  };
}

// enkel backoff (1s,2s,4s,8s,16s)
const backoffMs = [1000, 2000, 4000, 8000, 16000];

// plocka texter från lexikon för nivå 5 (valfritt)
async function loadLexicon(env) {
  // Pages har inget filsystem i runtime, så läs från public/ eller embedda manuellt.
  // Vi antar att lexikon ligger tillgängligt via /lexicon.json (public root).
  try {
    const res = await fetch('https://' + env.CF_PAGES_URL + '/lexicon.json');
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function buildSystem(level) {
  if (level === 5) {
    // het & explicit – safe_mode av
    return [
      'Skriv på svenska. Berättelsen ska vara tydlig, erotiskt explicit,',
      'men håll flyt, naturlig dialog och undvik upprepningar.',
      'Ingen moralpredikan. Undvik klyschor som "ceder och rök".'
    ].join(' ');
  }
  // nivå 3 – sensuell men ej grafisk
  return [
    'Skriv på svenska. Sensuell, romantisk ton utan grova könsord.',
    'Naturligt flyt, undvik upprepningar och klyschor.'
  ].join(' ');
}

function stitchPrompt(level, idea, minutes, lex) {
  const approxWords = Math.min(1200, Math.max(300, minutes * 180)); // ca 180 ord/min
  const guide = [
    `Längd: ungefär ${approxWords} ord.`,
    `Idé: ${idea || 'fri fantasi'}.`,
    (level === 5 && lex?.L5_explicit?.length)
      ? `Använd några av dessa ingredienser på ett smakfullt sätt: ${lex.L5_explicit.slice(0, 25).join(' | ')}.`
      : ''
  ].filter(Boolean).join('\n');
  return guide;
}

async function callMistral(env, sys, user, maxTokens, safeMode) {
  let lastErr = null;
  for (let i = 0; i < backoffMs.length; i++) {
    const { signal, clear } = withTimeout(60000); // 60s server-timeout
    try {
      const res = await fetch(MISTRAL_URL, {
        method: 'POST',
        signal,
        headers: {
          'Authorization': `Bearer ${env.MISTRAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MISTRAL_MODEL,
          input: [
            { role: 'system', content: sys },
            { role: 'user',   content: user }
          ],
          temperature: 0.9,
          max_output_tokens: maxTokens,
          safe_mode: safeMode ? true : false,
          response_format: { type: 'text' }
        })
      });
      clear();

      if (res.ok) {
        const data = await res.json();
        // /v1/responses kan ge output_text eller outputs[…]
        const text = data?.output_text
          || data?.outputs?.[0]?.content?.[0]?.text
          || data?.choices?.[0]?.message?.content
          || '';
        if (!text) throw new Error('empty mistral text');
        return { ok: true, text };
      }

      // retry på 429 & 5xx
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        lastErr = await res.text().catch(()=>'');
        await new Promise(r => setTimeout(r, backoffMs[i]));
        continue;
      }

      // övriga fel – returnera direkt
      const det = await res.text().catch(()=> '');
      return { ok: false, error: `mistral_${res.status}`, detail: det };
    } catch (e) {
      lastErr = e?.message || String(e);
      // nät/timeout → retry
      await new Promise(r => setTimeout(r, backoffMs[i]));
      continue;
    }
  }
  return { ok: false, error: 'mistral_retry_exhausted', detail: lastErr };
}

export async function onRequestPost({ request, env }) {
  try {
    const { idea, level = 3, minutes = 5 } = await request.json().catch(()=> ({}));
    if (!idea || !minutes) return badRequest('saknar idea/minutes', request);
    if (!env?.MISTRAL_API_KEY) return serverError('saknar MISTRAL_API_KEY', request);

    const lex = await loadLexicon(env).catch(()=>null);
    const sys = buildSystem(level);
    const user = stitchPrompt(level, idea, minutes, lex);

    // nivå 5: safe_mode av; nivå 3: safe_mode på
    const safeMode = (level === 3);
    const maxTokens = Math.min(1600, Math.max(600, minutes * 120)); // defensiv tokenbudget

    const out = await callMistral(env, sys, user, maxTokens, safeMode);
    if (!out.ok) return jsonResponse({ ok:false, error: out.error, detail: out.detail }, 500, request);

    return jsonResponse({ ok:true, text: out.text, provider: 'mistral' }, 200, request);
  } catch (e) {
    return serverError(e, request);
  }
}

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request) });
}
