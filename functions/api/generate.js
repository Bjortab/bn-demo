// functions/api/generate.js — GC v2.0 (Mistral på nivå 4–5, OpenAI på 1–3)
import { jsonResponse, corsHeaders, badRequest, serverError } from "./_utils.js";

/**
 * Body (JSON):
 *  { idea: string, level: 1|2|3|4|5, minutes: 5|10|15 }
 *
 * Svar (JSON):
 *  { ok: true, text: "…" }  eller  { ok:false, error:"…", detail? }
 *
 * Provider-val:
 *  - level 1–3  -> OpenAI (Responses API)
 *  - level 4–5  -> Mistral (Chat Completions)
 *  - Fallbackar om nyckel saknas
 */

function mapTokensTarget(minutes = 5) {
  // Konservativt för att undvika lång svarstid/timeout på Pages Functions
  if (minutes >= 15) return 1600;
  if (minutes >= 10) return 1400;
  return 1100; // 5 min
}

function levelHint(level = 3) {
  const L = Number(level) || 3;
  if (L <= 2) return "Nivå 1–2: mjuk/sensuell, utan explicit språk.";
  if (L === 3) return "Nivå 3: het och sensuell, undvik grovt språk.";
  if (L === 4) return "Nivå 4: het, direkt, vuxet språk; inga olagliga teman.";
  return "Nivå 5: explicit vuxet språk, tydligt samtycke; undvik olagliga teman.";
}

const SYS_BASE = [
  "Du skriver erotiska berättelser på svenska för uppläsning (TTS).",
  "Skriv flytande, idiomatisk svenska utan upprepningar och utan direktöversatt engelska.",
  "Struktur: mjuk start → stegring → klimax → mjukt efterspel.",
  "Allt är samtyckande och mellan vuxna. Inga minderåriga, inga släktrelationer, inga olagliga teman.",
].join(" ");

function buildUserPrompt(idea, level, minutes) {
  return [
    `Idé: ${idea || "(ingen idé — skapa fristående scen i svensk miljö)"}`,
    `Intensitet: ${levelHint(level)}`,
    `Längd: ca ${minutes} min uppläsning.`,
    "Skriv i löpande prosa (inga rubriker/punktlistor). Variera men håll röd tråd.",
  ].join("\n");
}

async function callWithTimeout(url, options, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text(); // läs alltid som text först
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI(env, { idea, level, minutes, tokens }) {
  const sys = SYS_BASE;
  const user = buildUserPrompt(idea, level, minutes);

  const body = {
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: sys },
      { role: "user",   content: user }
    ],
    max_output_tokens: tokens,
    temperature: 0.92,
    presence_penalty: 0.35,
    frequency_penalty: 0.3
  };

  const r = await callWithTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    },
    45000
  );

  if (!r.ok) return { ok: false, status: r.status, raw: r.text };

  // Försök plocka ut text enligt Responses API
  try {
    const data = JSON.parse(r.text);
    let story = "";

    if (Array.isArray(data.output) && data.output.length > 0) {
      const first = data.output[0];
      if (Array.isArray(first.content) && first.content.length > 0) {
        story = first.content.map(x => x?.text ?? "").join("");
      } else if (typeof first.text === "string") {
        story = first.text;
      }
    }
    if (!story && typeof data.output_text === "string") {
      story = data.output_text;
    }
    if (!story?.trim()) return { ok: false, status: 502, raw: r.text, detail: "empty" };

    return { ok: true, text: story.trim() };
  } catch {
    return { ok: false, status: 500, raw: r.text, detail: "parse_error" };
  }
}

async function callMistral(env, { idea, level, minutes, tokens }) {
  const sys  = SYS_BASE;
  const user = buildUserPrompt(idea, level, minutes);

  // välj en etablerad modell – byt vid behov
  const model = "mistral-large-latest";

  const body = {
    model,
    messages: [
      { role: "system", content: sys },
      { role: "user",   content: user }
    ],
    temperature: 0.95,
    max_tokens: tokens,
    presence_penalty: 0.35,
    frequency_penalty: 0.3
  };

  const r = await callWithTimeout(
    "https://api.mistral.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.MISTRAL_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    },
    45000
  );

  if (!r.ok) return { ok: false, status: r.status, raw: r.text };

  try {
    const data = JSON.parse(r.text);
    const text = data?.choices?.[0]?.message?.content || "";
    if (!text?.trim()) return { ok: false, status: 502, raw: r.text, detail: "empty" };
    return { ok: true, text: text.trim() };
  } catch {
    return { ok: false, status: 500, raw: r.text, detail: "parse_error" };
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return badRequest("Use POST", request);
  }

  // Läs body
  let idea = "", level = 3, minutes = 5;
  try {
    const b = await request.json();
    idea    = (b?.idea ?? "").toString().trim();
    level   = Number(b?.level ?? 3);
    minutes = Number(b?.minutes ?? 5);
  } catch {
    return badRequest("Body måste vara JSON", request);
  }

  if (![1,2,3,4,5].includes(level))  level = 3;
  if (![5,10,15].includes(minutes)) minutes = 5;

  // Provider-val: Mistral för 4–5, annars OpenAI
  let provider = (level >= 4) ? "mistral" : "openai";
  if (provider === "mistral" && !env.MISTRAL_API_KEY) {
    provider = "openai"; // fallback
  }
  if (provider === "openai" && !env.OPENAI_API_KEY) {
    return serverError("OPENAI_API_KEY saknas (och MISTRAL_API_KEY saknas för fallback)", request);
  }

  const tokens = mapTokensTarget(minutes);

  try {
    let result;
    if (provider === "mistral") {
      result = await callMistral(env, { idea, level, minutes, tokens });
      // Om Mistral fallerar och OpenAI finns → fallback
      if (!result.ok && env.OPENAI_API_KEY) {
        result = await callOpenAI(env, { idea, level, minutes, tokens });
      }
    } else {
      result = await callOpenAI(env, { idea, level, minutes, tokens });
      // Om OpenAI fallerar och Mistral finns → fallback
      if (!result.ok && env.MISTRAL_API_KEY) {
        result = await callMistral(env, { idea, level, minutes, tokens });
      }
    }

    if (!result.ok) {
      const detail = {
        providerTried: provider,
        status: result.status || 0,
        raw: (result.raw || "").slice(0, 500),
        info: result.detail || null
      };
      return jsonResponse({ ok: false, error: "LLM error/empty", detail }, 502, request);
    }

    return jsonResponse({ ok: true, text: result.text }, 200, request);
  } catch (err) {
    return serverError(err?.message || "unexpected", request);
  }
}
