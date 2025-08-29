// functions/api/generate.js  — Golden Copy v3 (Mistral only + retries)

import { corsHeaders, jsonResponse, badRequest, serverError } from './_utils.js';

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-large-latest';

// Ungefärlig tokenbudget: ~400 tok/min för svenska funkar bra i praktiken
function tokensForMinutes(mins = 5) {
  const t = Math.max(1, Number(mins) || 5);
  return Math.min(3500, Math.round(t * 400));
}

// Små hjälpare
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripNoise(s = '') {
  return String(s)
    .replace(/\s{2,}/g, ' ')
    .replace(/[ \t]+(\n)/g, '$1')
    .trim();
}

function dedupeLines(text) {
  const seen = new Set();
  return text
    .split(/\n+/)
    .filter((ln) => {
      const key = ln.toLowerCase().trim();
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n');
}

function buildAntiClicheBlock() {
  // Undvik slitna uttryck
  return [
    'Undvik klyschor som "doft av ceder och rök", "elektriskt pirr i luften", "världen försvinner", "som i slow motion".',
    'Undvik upprepade fyllnadsfraser och mekaniska omtagningar.',
    'Använd korrekt svensk grammatik och naturlig ordföljd.',
  ].join(' ');
}

function pickPhrases(lex, level) {
  if (!lex) return [];
  if (Number(level) >= 5 && Array.isArray(lex.L5_explicit)) return lex.L5_explicit;
  if (Array.isArray(lex.L3_sensuell)) return lex.L3_sensuell;
  // fallback om nycklarna heter lite annorlunda
  return [].concat(lex.explicit || [], lex.sensuell || []);
}

async function loadLexicon(request) {
  try {
    // lexicon.json ligger i repo-roten
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/lexicon.json`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function systemPrompt(level, minutes, phrases = []) {
  const anti = buildAntiClicheBlock();
  const minutesTxt = `Mål-längd: cirka ${minutes} min uppläsning.`;

  if (Number(level) >= 5) {
    // Explicit nivå
    const bias = phrases.length ? `Inkorporera naturligt några av dessa uttryck när det passar: ${phrases.slice(0, 30).join(', ')}.` : '';
    return stripNoise(
      [
        'Du är en svensk erotikförfattare som skriver explicita, vuxna berättelser i jag-form.',
        'Håll ett naturligt flyt och rytm; undvik listor, punktade uppräkningar och upprepningar.',
        'Fokusera på konkreta kroppsliga känslor, dialog och växelvis tempo – bygg upp och släpp loss.',
        anti,
        minutesTxt,
        bias,
      ].join(' ')
    );
  }

  // Sensuell nivå
  const bias = phrases.length ? `Du kan subtilt använda uttryck som: ${phrases.slice(0, 30).join(', ')}.` : '';
  return stripNoise(
    [
      'Du är en svensk författare som skriver sensuella, romantiska berättelser i jag-form.',
      'Tonen är intim och varm, inte rå. Undvik grova könsord men tillåt laddade detaljer när det känns äkta.',
      'Variera meningarnas längd och använd dialog för närvaro. Inga upprepningar.',
      anti,
      minutesTxt,
      bias,
    ].join(' ')
  );
}

function userPrompt(idea, level) {
  const lead =
    Number(level) >= 5
      ? 'Skriv en sammanhängande explicit berättelse på svenska, i jag-form, utan kapitelrubriker:'
      : 'Skriv en sammanhängande sensuell berättelse på svenska, i jag-form, utan kapitelrubriker:';
  return `${lead}\n\nIdé: ${idea}`;
}

async function callMistralWithRetry({ env, sys, usr, max_tokens }, attempts = 5) {
  if (!env.MISTRAL_API_KEY) throw new Error('saknar MISTRAL_API_KEY');

  // Exponentiellt backoff: 0.6s, 1.0s, 1.6s, 2.4s, 3.2s
  const backoff = [600, 1000, 1600, 2400, 3200];

  for (let i = 0; i < attempts; i++) {
    const res = await fetch(MISTRAL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: usr },
        ],
        temperature: Number(sys.includes('explicit')) ? 0.95 : 0.85,
        top_p: 0.95,
        max_tokens,
        // inga "presence_penalty" etc — Mistral stöder inte dem i denna endpoint
        safe_mode: false,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || '';
      return stripNoise(dedupeLines(text));
    }

    // Kapacitets-/tillfälligt fel → backoff och försök igen
    if (res.status === 429 || res.status === 503) {
      if (i < attempts - 1) {
        await sleep(backoff[i] || 1500);
        continue;
      }
      // Efter sista försöket: skicka informativt fel
      const hint =
        'Mistral är tillfälligt fullt för den här nivån. Vänta en liten stund och tryck Generera igen. (Ingen fallback används för att bevara nivån.)';
      return { __capacityError: true, status: res.status, hint };
    }

    // Andra fel → försök inte fler gånger
    const detail = await res.text().catch(() => '');
    throw new Error(`mistral_${res.status}: ${detail.slice(0, 300)}`);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const { idea, level = 3, minutes = 5 } = await request.json().catch(() => ({}));
    if (!idea || !String(idea).trim()) return badRequest('saknar idé', request);

    const max_tokens = tokensForMinutes(minutes);

    // Lexikon
    const lex = await loadLexicon(request);
    const phrases = pickPhrases(lex, level);

    // Prompter
    const sys = systemPrompt(level, minutes, phrases);
    const usr = userPrompt(idea, level);

    // Mistral only + retry
    const out = await callMistralWithRetry({ env, sys, usr, max_tokens }, 5);

    if (out && out.__capacityError) {
      return jsonResponse(
        {
          ok: false,
          provider: 'mistral',
          code: 'capacity',
          status: out.status,
          message: out.hint,
        },
        429,
        request
      );
    }

    if (!out || out.length < 20) {
      return serverError('tomt svar från Mistral', request);
    }

    return jsonResponse(
      {
        ok: true,
        provider: 'mistral',
        model: MISTRAL_MODEL,
        text: out,
      },
      200,
      request
    );
  } catch (err) {
    return serverError(err, request);
  }
}

// CORS preflight
export function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request) });
}
