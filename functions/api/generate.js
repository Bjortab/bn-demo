// functions/api/generate.js
// GC v2.2 — Mistral→OpenAI fallback, anti-kliché, stilstyrning, robust parsing

import { jsonResponse, corsHeaders, badRequest, serverError } from "./_utils.js";

// --- Tunables ---------------------------------------------------------------
const WPM = 230;                     // ord/min ~ svensk uppläsning
const TOKENS_PER_WORD = 1.35;        // grovt snitt
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";  // snål, men tillräcklig för BN
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_MODEL = "mistral-large-latest";

// Anti-kliché & stilregler (finns även i /lexicon.json – dessa används om JSON ej laddas)
const DEFAULT_ANTI_CLICHE = [
  "doft av ceder", "doft av rök", "kanel", "rosdoft", "hon log mystiskt",
  "hjärtat slog i bröstet", "tiden stod stilla", "han var som en gud",
  "hans blick borrade sig", "våg efter våg av känslor", "eld och is",
  "smälte samman till ett", "perfekt harmoni", "universum höll andan"
];

const DEFAULT_STYLE_HINTS = {
  lvl3: [
    "sensuellt, närvarande och vardagligt språk",
    "undvik klichéer och överdrivna metaforer",
    "lätt tempo, mjuka övergångar, små pauser mellan scener",
    "håll det smakfullt – ingen grafik"
  ],
  lvl4: [
    "hetare ton och tydligare kroppslighet utan att bli grovt",
    "mer direkta replikskiften",
    "variera ordval, undvik upprepningar",
    "realistiska rörelser; undvik biologiska orimligheter"
  ],
  lvl5: [
    "mycket explicit ton men på idiomatisk svenska",
    "använd repliker för intensitet och tempo",
    "undvik klichéer, undvik stereotypa jämförelser",
    "håll kronologi och realism – inga orimliga kroppsliga påståenden"
  ]
};

// ---------------------------------------------------------------------------

function minutesToMaxTokens(mins) {
  const words = Math.max(60, Math.floor(mins * WPM));
  return Math.min(3200, Math.floor(words * TOKENS_PER_WORD)); // säkerhetscap
}

function levelToStyle(level) {
  if (level >= 5) return "explicit";
  if (level >= 4) return "het";
  return "sensuell";
}

function buildSystemPrompt(level, antiCliche, styleHints) {
  const mode = levelToStyle(level);
  const hints = (styleHints[`lvl${Math.min(level,5)}`] || []).join("; ");
  return [
    `Du är en svensk berättarröst. Skriv på naturlig, idiomatisk svenska.`,
    `Stil: ${mode}.`,
    `Undvik klichéer och överanvända uttryck: ${antiCliche.join(", ")}.`,
    `Regler: grammatiskt korrekt, realistiska rörelser, inga biologiska orimligheter.`,
    `Flyt: undvik upprepningar, använd varierade meningar och dynamik.`,
    `Tips: använd korta repliker när det driver scenen, och markera pauser i texten med tre punkter eller radbryt.`,
    `Ytterligare riktlinjer: ${hints}`
  ].join(" ");
}

function buildUserPrompt({ idea, level, minutes }) {
  return [
    `Uppgift: Skriv en sammanhållen berättelse baserat på idén: "${idea}".`,
    `Längdsmål: ca ${minutes} min uppläsning.`,
    `Berättarperspektiv: nära, kroppsnära, i presens eller preteritum – men håll det konsekvent.`,
    `Avsluta scenen tydligt (avrundning), inte tvärt.`,
  ].join("\n");
}

async function readLexicon(origin) {
  try {
    // Försök läsa /lexicon.json som statisk asset (om fronten har den)
    const res = await fetch(`${origin}/lexicon.json`, { method: "GET" });
    if (!res.ok) throw new Error("lexicon fetch fail");
    const data = await res.json();
    const anti = Array.isArray(data?.anti_cliche) ? data.anti_cliche : DEFAULT_ANTI_CLICHE;
    const hints = data?.style_hints || DEFAULT_STYLE_HINTS;
    return { anti, hints };
  } catch {
    return { anti: DEFAULT_ANTI_CLICHE, hints: DEFAULT_STYLE_HINTS };
  }
}

function sanitizeIdea(idea = "") {
  return String(idea || "").trim().slice(0, 1400);
}

function withTimeout(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("timeout")), ms);
  return { signal: ac.signal, clear: () => clearTimeout(t) };
}

async function callMistral(env, messages, max_tokens, timeoutMs) {
  if (!env.MISTRAL_API_KEY) throw new Error("saknar_MISTRAL_API_KEY");
  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const res = await fetch(MISTRAL_URL, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages,
        temperature: 0.9,
        max_tokens
      })
    });
    const raw = await res.text();
    if (!res.ok) {
      let detail = "";
      try { detail = JSON.stringify(JSON.parse(raw)); } catch { detail = raw; }
      throw new Error(`mistral_${res.status}: ${detail}`);
    }
    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content || "";
    return text;
  } finally {
    clear();
  }
}

async function callOpenAI(env, messages, max_tokens, timeoutMs) {
  if (!env.OPENAI_API_KEY) throw new Error("saknar_OPENAI_API_KEY");
  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.85,
        max_tokens,
        // OBS! inga presence/frequency_penalties -> undviker 400 "unknown parameter"
      })
    });
    const raw = await res.text();
    if (!res.ok) {
      let detail = "";
      try { detail = JSON.stringify(JSON.parse(raw)); } catch { detail = raw; }
      throw new Error(`openai_${res.status}: ${detail}`);
    }
    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content || "";
    return text;
  } finally {
    clear();
  }
}

function postClean(text, antiCliche) {
  if (!text) return "";
  let s = text;

  // Rensa klyschor väldigt enkelt (kan göras mer sofistikerat)
  for (const c of antiCliche) {
    const re = new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    s = s.replace(re, "");
  }

  // Normalisera blankrader och mellanslag
  s = s.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();

  // Avslut – lägg till avrundning om texten slutar extremt abrupt
  if (!/[.!?…]$/.test(s.slice(-1))) s += "…";
  return s;
}

function toSSML(text, level) {
  // Enkel SSML—pauser runt repliker och styckespauser
  const safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const pauseShort = level >= 4 ? "300ms" : "200ms";
  const pausePara = level >= 4 ? "600ms" : "500ms";

  // Infoga pauser efter meningar och före citat
  const withSentPauses = safe
    .replace(/([.!?…])\"?\s+/g, `$1<break time="${pauseShort}"/> `);

  const withParaPauses = withSentPauses.replace(/\n{2,}/g, `<break time="${pausePara}"/>`);

  return `<speak>${withParaPauses}</speak>`;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return badRequest("Use POST", request);

  try {
    const origin = new URL(request.url).origin;
    const { anti, hints } = await readLexicon(origin);

    const body = await request.json().catch(() => ({}));
    const level = Number(body?.level ?? 3);
    const minutes = Math.max(1, Math.min(15, Number(body?.minutes ?? 5)));
    const idea = sanitizeIdea(body?.idea ?? "");

    if (!idea) return badRequest("saknar idé", request);

    const sys = buildSystemPrompt(level, anti, hints);
    const usr = buildUserPrompt({ idea, level, minutes });
    const messages = [
      { role: "system", content: sys },
      { role: "user", content: usr }
    ];
    const maxTokens = minutesToMaxTokens(minutes);
    const timeoutMs = 22000; // Cloudflare Pages: håll det tajt men användbart

    // Fallback: Mistral → OpenAI
    let story = "";
    try {
      story = await callMistral(env, messages, maxTokens, timeoutMs);
    } catch (e) {
      // 429 eller annan provider-fail -> försök OpenAI
      story = await callOpenAI(env, messages, maxTokens, timeoutMs);
    }

    story = postClean(story, anti);

    // Gör SSML åt TTS (frontend kan välja använda text eller ssml)
    const ssml = toSSML(story, level);

    return jsonResponse(
      { ok: true, provider: story ? "ok" : "empty", story, ssml },
      200,
      request
    );

  } catch (err) {
    return serverError(err, request);
  }
}
