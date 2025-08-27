// functions/api/generate.js — GC v1.2
import { jsonResponse, corsHeaders, badRequest, serverError } from "./_utils.js";

/*
  Body (JSON):
  {
    "idea": "text",
    "level": 1|3|5,
    "minutes": 5|10|15
  }

  Svar (JSON):
  { ok: true, text: "berättelse..." }
*/

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return badRequest("Use POST", request);
  }
  if (!env.OPENAI_API_KEY) {
    return serverError("OPENAI_API_KEY missing (Cloudflare env)", request);
  }

  try {
    const { idea = "", level = 3, minutes = 5 } = await request.json().catch(() => ({}));

    // mycket enkel validering
    const lvl = [1,3,5].includes(Number(level)) ? Number(level) : 3;
    const mins = [5,10,15].includes(Number(minutes)) ? Number(minutes) : 5;

    // ca tokens utifrån minuter (ca 250 wpm ≈ 750 tecken/min grovt mätt)
    const maxTokens = Math.min(2200, Math.round(mins * 250 * 0.9));

    // systemprompt – håll neutral här; nivåerna/lexikon löser du i front-end/lexicon.json
    const sys = [
      "Du skriver korta erotiska berättelser på svenska.",
      "Tydligt, sammanhängande och flytande, inga upprepningar eller listor.",
      "Anpassa tonen efter nivå (nivå 1 sensuell, 3 hetare, 5 explicit).",
      "Var konsekvent i perspektiv och tempus.",
      "Undvik stolpighet och engelsk direktöversättning.",
    ].join(" ");

    const user = idea && idea.trim().length > 0
      ? `Användaridé: ${idea}`
      : "Skapa en fristående scen, svensk miljö, naturlig dialog, sensuell stegring.";

    // OpenAI Responses API
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system",  content: sys },
          { role: "user",    content: user },
          { role: "user",    content: `Nivå: ${lvl}, Längd: ${mins} min.` }
        ],
        max_output_tokens: maxTokens,
        temperature: 0.9
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return jsonResponse({ ok: false, error: "LLM error", detail: errText, status: res.status }, res.status, request);
    }

    const data = await res.json().catch(() => ({}));

    // Responses API: plocka första textfältet
    let text = "";
    if (data?.output?.length) {
      const first = data.output[0];
      if (first?.content?.length) {
        text = first.content[0]?.text || "";
      }
    }
    if (!text) text = data?.output_text || ""; // fallback om modellen returnerar output_text

    if (!text) {
      return jsonResponse({ ok: false, error: "empty response" }, 502, request);
    }

    return jsonResponse({ ok: true, text }, 200, request);
  } catch (err) {
    return serverError(err, request);
  }
}
