// functions/api/generate.js
// GC v2.1 — OpenAI (nivå 1–3) + Mistral (nivå 4–5) med timeout & token-guard

import { jsonResponse, corsHeaders, badRequest, serverError } from "./_utils.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

// Max tokens per vald längd (svarstext)
const TOKENS_BY_MIN = { 5: 900, 10: 1300, 15: 1600 };

// Fallback om minutes saknas/ogiltig
const DEFAULT_MINUTES = 5;

// Grov “token”-approx för att klippa input (ca 4 chars per token)
const MAX_INPUT_TOKENS = 350; // vi siktar lågt för att undvika timeouts
const CHARS_PER_TOKEN = 4;

// Abort-timeout för fetchar mot modell (ms)
const TIMEOUT_MS_PRIMARY = 12000; // 12s
const TIMEOUT_MS_RETRY   = 8000;  // 8s (kortare prompt vid omtag)

// Sanering: trimma och klipp sträng till X “tokens”
function clampText(s = "", maxTokens = MAX_INPUT_TOKENS) {
  if (!s) return "";
  const maxChars = Math.max(16, Math.floor(maxTokens * CHARS_PER_TOKEN));
  s = String(s).trim().replace(/\s+/g, " ");
  return s.length > maxChars ? s.slice(0, maxChars) + " …" : s;
}

// Bygg systemprompt (svenska). Lättare för 1–3, friare för 4–5 men lagligt.
function systemPrompt(level) {
  const base =
    "Du skriver på svensk prosa. Hög läsbarhet, naturligt flyt, inga listor, ingen meta. Undvik upprepningar och stolpighet. Berättarröst ska kännas mänsklig, med tempo och rytm. Alltid samtyckande vuxna. Absolut inget olagligt, minderåriga, tvång, våld, droger eller icke-samtycke. Ingen diskriminering eller hat.";

  if (level >= 4) {
    // Hetare, men fortfarande inom lagliga ramar.
    return (
      base +
      " Nivå 4–5: sensuell, nära kroppen, emotionell intensitet. Använd svenska uttryck och idiom – undvik direktöversatta engelska fraser. Grovt eller olagligt språk förbjudet. Håll tråden sammanhängande med tydlig dramaturgi (början, stegring, klimax, avrundning)."
    );
  }
  // Snällare nivåer.
  return (
    base +
    " Nivå 1–3: romantiskt, mjukt och suggestivt. Fokus på stämning, blickar, beröring och känsla – inte råa detaljer. Håll språket vårdat och naturligt."
  );
}

// Formatera användar-idé + styrparametrar till en kompakt prompt
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

// AbortController med timeout
function withTimeout(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("timeout")), ms);
  return { signal: ac.signal, cancel: () => clearTimeout(t) };
}

// Kalla OpenAI Responses API
async function callOpenAI(env, { sys, user, max_tokens, timeoutMs }) {
  if (!env.OPENAI_API_KEY) throw new Error("saknar OPENAI_API_KEY");
  const { signal, cancel } = withTimeout(timeoutMs);

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      signal,
      headers: {
        "authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json"
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
    // Responses-schema → hämta första text
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

// Kalla Mistral Chat Completions
async function callMistral(env, { sys, user, max_tokens, timeoutMs }) {
  if (!env.MISTRAL_API_KEY) throw new Error("saknar MISTRAL_API_KEY");
  const { signal, cancel } = withTimeout(timeoutMs);

  try {
    const res = await fetch(MISTRAL_URL, {
      method: "POST",
      signal,
      headers: {
        "authorization": `Bearer ${env.MISTRAL_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        // stabil och kapabel modell
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

// Huvud-handler
export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return badRequest("Use POST");
  }

  try {
    const body = await request.json().catch(() => ({}));
    let { idea = "", level = 3, minutes = DEFAULT_MINUTES } = body || {};

    // Validering
    level = Number(level);
    minutes = [5, 10, 15].includes(Number(minutes)) ? Number(minutes) : DEFAULT_MINUTES;
    if (Number.isNaN(level) || level < 1 || level > 5) level = 3;

    // Token-budget
    const maxTokens = TOKENS_BY_MIN[minutes] || TOKENS_BY_MIN[DEFAULT_MINUTES];

    // Trimma/klipp idé så vi inte spränger timeout
    const safeIdea = clampText(idea, MAX_INPUT_TOKENS);

    const sys = systemPrompt(level);
    const usr = buildUserPrompt({ idea: safeIdea, level, minutes });

    // Provider-val
    const useMistral = level >= 4;

    // Primärt försök
    try {
      const text = useMistral
        ? await callMistral(env, { sys, user: usr, max_tokens: maxTokens, timeoutMs: TIMEOUT_MS_PRIMARY })
        : await callOpenAI(env, { sys, user: usr, max_tokens: maxTokens, timeoutMs: TIMEOUT_MS_PRIMARY });

      return jsonResponse({ ok: true, text }, 200, corsHeaders(request));
    } catch (e1) {
      // Retry med striktare gränser (kortare input + färre tokens)
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
        // Ge ett tydligt fel tillbaka till frontend
        return jsonResponse(
          { ok: false, error: "LLM timeout/err", detail: String(e2?.message || e2) },
          504,
          corsHeaders(request)
        );
      }
    }
  } catch (err) {
    return serverError(err, corsHeaders(context.request));
  }
}
