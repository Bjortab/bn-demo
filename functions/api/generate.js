// functions/api/generate.js  (GC v1.0)
// Växlar OpenAI (nivå 1–3) ⇄ Mistral (nivå 4–5).
// Kräver secrets i Cloudflare Pages: OPENAI_API_KEY, MISTRAL_API_KEY.

import { jsonResponse, badRequest, serverError, corsHeaders } from "./_utils.js";

const OPENAI_URL   = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

const MISTRAL_URL   = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_MODEL = "mistral-large-latest";

// max tokens per minut (lagom konservativt för att undvika timeouts)
const TOKENS_PER_MIN = 260;
// generell timeout (ms)
const TIMEOUT_MS = 45_000;

// ————————————————————————————————————————————————————————————

function withTimeout(ms = TIMEOUT_MS) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("timeout")), ms);
  const cancel = () => clearTimeout(t);
  return { signal: ac.signal, cancel };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function buildSystemPrompt(level) {
  // Viktigt: håll innehållet lagligt och icke-explicit.
  // (Gör texten varm/sensuell på högre nivåer utan grafiska detaljer.)
  const common =
    "Skriv en sammanhängande berättelse på svenska, i jag-form eller nära tredjeperson, med naturlig rytm och flyt. Undvik upprepningar och översättningsfel. Håll en mjuk, mänsklig berättarröst.";

  if (level >= 4) {
    return [
      common,
      "Ton: mer intensiv och passionerad, men undvik råa, grafiska och explicita sexuella detaljer.",
      "Fokusera på stämning, känslor, antydningar, attraktion och relationell dynamik; undvik att beskriva könsdelar eller handlingar explicit.",
    ].join(" ");
  }
  // nivå 1–3
  return [
    common,
    "Ton: romantisk, varm och diskret. Fokus på känslor, atmosfär, dialog och subtil spänning.",
  ].join(" ");
}

function buildUserPrompt(idea = "", level = 3, minutes = 5) {
  const mållängd = clamp(Math.round(minutes * TOKENS_PER_MIN), 300, 4000);
  // Lätt strukturerad instruktion
  return [
    `Idé: ${idea || "ingen specifik idé"}.`,
    `Nivå: ${level} (1=romantisk, 5=intensiv men icke-explicit).`,
    `Måltokens (ungefärlig längd): ${mållängd}.`,
    "Skapa en berättelse med tydlig början, stegring och avrundning. Undvik punktlistor, håll ett jämnt flyt.",
  ].join("\n");
}

async function callOpenAI(env, sys, usr, max_tokens, timeoutMs) {
  if (!env.OPENAI_API_KEY) throw new Error("saknar OPENAI_API_KEY");
  const { signal, cancel } = withTimeout(timeoutMs);

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      signal,
      headers: {
        "authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.9,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
        max_tokens: max_tokens,
      }),
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      throw new Error(`OpenAI fel: status=${res.status}, raw=${raw.slice(0, 400)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return content.trim();
  } finally {
    cancel();
  }
}

async function callMistral(env, sys, usr, max_tokens, timeoutMs) {
  if (!env.MISTRAL_API_KEY) throw new Error("saknar MISTRAL_API_KEY");
  const { signal, cancel } = withTimeout(timeoutMs);

  try {
    const res = await fetch(MISTRAL_URL, {
      method: "POST",
      signal,
      headers: {
        "authorization": `Bearer ${env.MISTRAL_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        temperature: 0.9,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
        max_tokens: max_tokens,
      }),
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      throw new Error(`Mistral fel: status=${res.status}, raw=${raw.slice(0, 400)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return content.trim();
  } finally {
    cancel();
  }
}

// ————————————————————————————————————————————————————————————

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS preflight (om den kommer fel hit)
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return badRequest("Use POST", request);
  }

  try {
    const { idea = "", level = 3, minutes = 5 } = await request.json().catch(() => ({}));

    const lvl = clamp(Number(level) || 3, 1, 5);
    const mins = clamp(Number(minutes) || 5, 1, 30);

    const maxTokens = clamp(Math.round(mins * TOKENS_PER_MIN), 300, 4000);

    const sys = buildSystemPrompt(lvl);
    const usr = buildUserPrompt(idea, lvl, mins);

    let story = "";
    if (lvl >= 4) {
      // nivå 4–5 → Mistral
      story = await callMistral(env, sys, usr, maxTokens, TIMEOUT_MS);
    } else {
      // nivå 1–3 → OpenAI
      story = await callOpenAI(env, sys, usr, maxTokens, TIMEOUT_MS);
    }

    if (!story) {
      return jsonResponse({ ok: false, error: "tomt svar" }, 200, request);
    }

    return jsonResponse(
      {
        ok: true,
        text: story,
        meta: { provider: lvl >= 4 ? "mistral" : "openai", level: lvl, minutes: mins },
      },
      200,
      request
    );
  } catch (err) {
    // Strippa extremt långa fel
    const msg = (err && err.message) ? String(err.message).slice(0, 800) : "server";
    return serverError(msg, request);
  }
}
