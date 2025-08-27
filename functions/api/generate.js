// functions/api/generate.js
//
// BN – Generate story (Cloudflare Pages Functions)
// Returnerar { ok: true, story: "..." } eller { ok:false, error:"..." }

import { json, corsHeaders, badRequest, serverError } from "../_utils.js";

/** Liten hjälpfunktion för att plocka ut text oavsett exakt svarformat */
function extractTextFromResponsesAPI(data) {
  // Nyare Responses API: data.output[0].content[0].text (type: "output_text")
  try {
    if (data && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (typeof c?.text === "string" && c.text.trim()) return c.text;
            if (typeof c?.output_text === "string" && c.output_text.trim()) return c.output_text;
          }
        }
      }
    }
  } catch (_) { /* ignore */ }

  // Äldre/alternativa fält (säkerhetsnät)
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;
  if (Array.isArray(data?.output_text) && typeof data.output_text[0] === "string")
    return data.output_text[0];

  // Sista fallback — ibland har vissa wrappers "choices[0].message.content"
  if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content;

  return "";
}

export async function onRequest(context) {
  const { request, env } = context;

  try {
    if (request.method !== "POST") {
      return badRequest("Use POST");
    }

    // Inkommande body
    const body = await request.json().catch(() => ({}));
    const idea   = (body.idea ?? "").toString();
    const level  = Number(body.level ?? 1);
    const minutes = Number(body.minutes ?? 3);

    // Miljö-nyckel från Cloudflare (Workers/Pages → Settings → Variables)
    // Namn: OPENAI_API_KEY
    const OPENAI = env?.OPENAI_API_KEY || env?.OPENAI_API_KEY?.toString();
    if (!OPENAI) {
      return json(
        { ok: false, error: "OPENAI_API_KEY saknas i Cloudflare env" },
        { status: 500, headers: corsHeaders(request) }
      );
    }

    // Enkel längd → tokens (grovt): ~250 ord/min → ~1800 tecken/min → ~250–300 tokens/min
    const maxTokens = Math.max(200, Math.round(minutes * 280));

    // Basprompt – nivåer styr ton
    const toneByLevel = {
      1: "snällt, romantiskt, oskyldigt; undvik explicita ord",
      2: "romantiskt, lite mer sensuellt; fortfarande mjukt",
      3: "sensuellt och närvarande; mer kropp och känsla",
      4: "tydligt erotisk ton; använd vuxna uttryck med stil",
      5: "mycket explicit vuxen erotik på svenska; använd direkta könsord och handlingar i naturligt språk, men undvik olagligt, ickesamtycke och minderåriga"
    };
    const system = `Du skriver korta erotiska berättelser på svenska. Håll ett naturligt flyt.
Nivå: ${toneByLevel[Math.min(5, Math.max(1, level))]}.
Undvik övertramp (minderåriga, tvång, icke-samtycke, droger).`;

    const user = idea && idea.trim()
      ? `Idé från användaren: ${idea.trim()}`
      : `Skapa en fristående scen utan extern idé.`;

    // OpenAI Responses API
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // välj ett stabilt, prisvärt modellnamn
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        max_output_tokens: maxTokens
      })
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      return json(
        { ok: false, error: "LLM error", detail: errTxt, status: res.status },
        { status: 502, headers: corsHeaders(request) }
      );
    }

    const data = await res.json();
    const story = extractTextFromResponsesAPI(data);

    return json(
      { ok: true, story },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch (err) {
    return serverError(err);
  }
}

export const config = {
  // Hjälper Pages Functions att inte cacha svaren
  cacheTtl: 0
};
