// functions/api/generate.js  — GC (svenska förbättrad + cleanup + OR primary)
import { corsHeaders, jsonResponse, badRequest, serverError } from './_utils.js';

/** ---------- utils ---------- **/
function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
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
    const res = await fetch(url.toString(), { headers: { accept: 'application/json' } });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

/** ---------- prompts ---------- **/
function buildSystemPrompt(level, minutes, lexicon) {
  const base =
    `Skriv en sammanhängande berättelse på svenska i jag-form. ` +
    `Flytande, idiomatisk svenska (inte ordagrann översättning). Variera meningslängd, ` +
    `använd naturlig dialog sparsamt, undvik klyschor ("doften av ceder", "kanel och rök") ` +
    `och undvik upprepningar. Håll röd tråd och avrunda scenen naturligt. ` +
    `Undvik svordomar (t.ex. fan, helvete, jävla). ` +
    `Lägg in subtila pauser med skiljetecken där tempot kräver det. ` +
    `Cirka ${minutes} min lyssning.`;

  if (Number(level) >= 5) {
    const phrases = (lexicon?.L5_explicit || []);
    const inject = pick(phrases, Math.min(10, Math.max(6, (phrases.length / 20) | 0 || 8)));
    return (
      base + ' Stil: explicit, vuxet och samtyckande. Tydliga kroppsliga beskrivningar. ' +
      (inject.length ? `Integrera några uttryck naturligt där de passar: ${inject.join(', ')}. ` : '')
    );
  }
  return base + ' Stil: sensuell, romantisk, utan grova könsord.';
}

function buildUserPrompt(idea, level, minutes) {
  return [
    `Idé: ${idea}`,
    `Nivå: ${level}`,
    `Längd: ${minutes} min`,
    `Undvik svordomar. Undvik upprepningar. En enda sammanhängande scen.`
  ].join('\n');
}

/** ---------- small post-cleanup på text ---------- **/
const SWEAR_MAP = {
  'fan': '…', 'helvete': '…', 'jävla': '…', 'fuck': '…'
};
function cleanTextSwedish(s) {
  if (!s) return s;
  let t = s;

  // normalisera whitespace/upprepningar
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ ]{2,}/g, ' ');
  t = t.replace(/([,.!?…])\1{1,}/g, '$1'); // inga "!!", "??"
  // ta bort identiska fras-upprepningar (enkelt skydd)
  t = t.replace(/\b(\w{3,} \w{3,})[, ]+\1\b/gi, '$1');

  // neutralisera svordomar
  for (const bad of Object.keys(SWEAR_MAP)) {
    const re = new RegExp(`\\b${bad}\\b`, 'gi');
    t = t.replace(re, SWEAR_MAP[bad]);
  }

  // små svenska finjusteringar
  t = t.replace(/\s+–\s+/g, ' – '); // tankstreck
  return t.trim();
}

/** ---------- providers ---------- **/
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
    if (!res.ok) throw new Error(`openrouter_${res.status}: ${raw.slice(0,400)}`);
    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('openrouter: tomt svar');
    return { provider: 'openrouter', model, text };
  } finally { clear(); }
}

async function callMistral(env, sys, user, maxTokens, timeoutMs) {
  if (!env.MISTRAL_API_KEY) throw new Error('saknar MISTRAL_API_KEY');
  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { 'Authorization': `Bearer ${env.MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        max_tokens: maxTokens,
        temperature: 0.9
      })
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`mistral_${res.status}: ${raw.slice(0,400)}`);
    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('mistral: tomt svar');
    return { provider: 'mistral', model: 'mistral-large-latest', text };
  } finally { clear(); }
}

async function callOpenAI(env, sys, user, maxTokens, timeoutMs) {
  if (!env.OPENAI_API_KEY) throw new Error('saknar OPENAI_API_KEY');
  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal,
      headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        max_output_tokens: maxTokens,
        temperature: 0.9
      })
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`openai_${res.status}: ${raw.slice(0,400)}`);
    const data = JSON.parse(raw);
    const text = data?.output?.[0]?.content?.[0]?.text?.trim() ?? data?.output_text?.trim();
    if (!text) throw new Error('openai: tomt svar');
    return { provider: 'openai', model: 'gpt-4o-mini', text };
  } finally { clear(); }
}

/** ---------- route ---------- **/
export async function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const { idea, level, minutes } = await request.json();
    if (!idea || !minutes) return badRequest('saknas fält: idea/minutes', request);

    const lvl = Number(level || 3);
    const mins = Math.max(3, Math.min(15, Number(minutes) || 5));
    const approxTokens = Math.round(mins * 380);
    const maxTokens = Math.max(600, Math.min(approxTokens, 2200));

    const lexicon = await loadLexicon(request);
    const sys = buildSystemPrompt(lvl, mins, lexicon);
    const user = buildUserPrompt(idea, lvl, mins);

    // OR primary (5 försök med backoff)
    let lastErr = null;
    if (env.OPENROUTER_API_KEY) {
      for (let a = 1; a <= 5; a++) {
        try {
          const preferred = (lvl >= 5)
            ? 'neversleep/llama-3.1-nemotron-70b-instruct'
            : 'gryphe/mythomax-l2-13b';
          const { text, provider, model } =
            await callOpenRouter(request, env, sys, user, maxTokens, 60_000, preferred);
          return jsonResponse({ ok: true, text: cleanTextSwedish(text), provider, model }, 200, request);
        } catch (e) {
          lastErr = String(e?.message || e);
          await new Promise(r => setTimeout(r, 350 * a));
        }
      }
    }

    if (env.MISTRAL_API_KEY) {
      try {
        const { text, provider, model } = await callMistral(env, sys, user, maxTokens, 55_000);
        return jsonResponse({ ok: true, text: cleanTextSwedish(text), provider, model, note: 'fallback:mistral' }, 200, request);
      } catch (e) { lastErr = String(e?.message || e); }
    }

    if (env.OPENAI_API_KEY) {
      try {
        const { text, provider, model } = await callOpenAI(env, sys, user, maxTokens, 55_000);
        return jsonResponse({ ok: true, text: cleanTextSwedish(text), provider, model, note: 'fallback:openai' }, 200, request);
      } catch (e) { lastErr = String(e?.message || e); }
    }

    return jsonResponse({
      ok: false,
      error: 'alla_backends_fel',
      detail: lastErr || 'ingen provider',
      advice: (lvl >= 5)
        ? 'OpenRouter kan vara fullt — prova igen på nivå 5 om några minuter.'
        : 'Prova igen strax.'
    }, 502, request);

  } catch (err) {
    return serverError(err, request);
  }
}
