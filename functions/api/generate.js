// functions/api/generate.js
// GC v2.1.1 — OpenAI (nivå 1–3) + Mistral (nivå 4–5), timeout & token-guard

import { jsonResponse, corsHeaders, badRequest, serverError } from "./_utils.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

const TOKENS_BY_MIN = { 5: 900, 10: 1300, 15: 1600 };
const DEFAULT_MINUTES = 5;

const MAX_INPUT_TOKENS = 350;
const CHARS_PER_TOKEN = 4;

const TIMEOUT_MS_PRIMARY = 12000;
const TIMEOUT_MS_RETRY   = 8000;

function clampText(s = "", maxTokens = MAX_INPUT_TOKENS) {
  if (!s) return "";
  const maxChars = Math.max(16, Math.floor(maxTokens * CHARS_PER_TOKEN));
  s = String(s).trim().replace(/\s+/g, " ");
  return s.length > maxChars ? s.slice(0, maxChars) + " …" : s;
}

function systemPrompt(level) {
  const base =
    "Du skriver på svensk prosa. Hög läsbarhet, naturligt flyt, inga listor. Undvik upprepningar. Röst som känns mänsklig. Alltid samtyckande vuxna. Absolut inget olagligt, minderåriga, tvång, våld, droger eller icke-samtycke.";

  if (level >= 4) {
    return (
      base +
      " Nivå 4–5: sensuell och intensiv men laglig. Använd svenska uttryck, undvik direktöversatta fraser. Tydlig dramaturgi (början, stegring, klimax, avrundning)."
    );
  }
  return (
    base +
    " Nivå 1–3: romantiskt, mjukt och suggestivt. Fokus på stämning och beröring – inte råa detaljer. Språket ska vara vårdat och naturligt."
  );
}

function buildUserPrompt({ idea, level, minutes }) {
  const guide =
    "Skriv en sammanhängande berättelse (svenska) i jag-form eller nära tredjeperson. Håll en naturlig röst och undvik upprepningar. Integrera idén organiskt.";
  const targetLen = minutes || DEFAULT_MINUTES;

  return [
    `Mål-längd: cirka ${targetLen} min högläsning.`,
    `Nivå: ${level} (1=snäll … 5=het).`,
    `Idé: ${idea ? idea : "(ingen idé – bygg en själv med mjuk start, stegring, avrundning)"}`,
    guide
  ].join(" ");
}

function withTimeout(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("timeout")), ms);
  return { signal: ac.signal, cancel: () => clearTimeout(t) };
}

async function callOpenAI(env, { sys, user, max_tokens, timeoutMs }) {
  if (!env.OPENAI_API_KEY) throw new Error("saknar OPENAI_API_KEY");
  const { signal, cancel } = withTimeout(timeoutMs);

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      signal,
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ],
        max_output_tokens: max_tokens
      })
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status}: ${txt || res.statusText}`);
    }
    const data = await res.json();
    let out = "";
    if (Array.isArray(data.output) && data.output.length > 0) {
      const first = data.output[0];
      if (first && Array.isArray(first.content) && first.content.length > 0) {
        out = first.content[0]?.text || "";
      }
    }
    if (!out) throw new Error("tomt svar från OpenAI");
    return out;
  } finally {
    cancel();
  }
}

async function callMistral(env, { sys, user, max_tokens, timeoutMs }) {
  if (!env.MISTRAL_API_KEY) throw new Error("saknar MISTRAL_API_KEY");
  const { signal, cancel } = withTimeout(timeoutMs);

  try {
    const res = await fetch(MISTRAL_URL, {
      method: "POST",
      signal,
      headers: {
        authorization: `Bearer ${env.MISTRAL_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "open-mixtral-8x7b",
        temperature: 0.9,
        max_tokens,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ]
      })
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Mistral ${res.status}: ${txt || res.statusText}`);
    }
    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error("tomt svar från Mistral");
    return out;
  } finally {
    cancel();
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return badRequest("Use POST", request); // ✅ skicka request
  }

  try {
    const body = await request.json().catch(() => ({}));
    let { idea = "", level = 3, minutes = DEFAULT_MINUTES } = body || {};

    level = Number(level);
    minutes = [5, 10, 15].includes(Number(minutes)) ? Number(minutes) : DEFAULT_MINUTES;
    if (Number.isNaN(level) || level < 1 || level > 5) level = 3;

    const maxTokens = TOKENS_BY_MIN[minutes] || TOKENS_BY_MIN[DEFAULT_MINUTES];
    const safeIdea = clampText(idea, MAX_INPUT_TOKENS);

    const sys = systemPrompt(level);
    const usr = buildUserPrompt({ idea: safeIdea, level, minutes });

    const useMistral = level >= 4;

    try {
      const text = useMistral
        ? await callMistral(env, { sys, user: usr, max_tokens: maxTokens, timeoutMs: TIMEOUT_MS_PRIMARY })
        : await callOpenAI(env, { sys, user: usr, max_tokens: maxTokens, timeoutMs: TIMEOUT_MS_PRIMARY });

      return jsonResponse({ ok: true, text }, 200, corsHeaders(request));
    } catch (e1) {
      const retryUsr = buildUserPrompt({
        idea: clampText(safeIdea, Math.floor(MAX_INPUT_TOKENS * 0.6)),
        level,
        minutes
      });
      const retryTokens = Math.max(600, Math.floor(maxTokens * 0.7));

      try {
        const text2 = useMistral
          ? await callMistral(env, { sys, user: retryUsr, max_tokens: retryTokens, timeoutMs: TIMEOUT_MS_RETRY })
          : await callOpenAI(env, { sys, user: retryUsr, max_tokens: retryTokens, timeoutMs: TIMEOUT_MS_RETRY });

        return jsonResponse({ ok: true, text: text2, downgraded: true }, 200, corsHeaders(request));
      } catch (e2) {
        return jsonResponse(
          { ok: false, error: "LLM timeout/err", detail: String(e2?.message || e2) },
          504,
          corsHeaders(request)
        );
      }
    }
  } catch (err) {
    // ✅ skicka request, inte headers
    return serverError(err, request);
  }
}
