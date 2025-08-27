// functions/api/generate.js
import { jsonResponse, corsHeaders, serverError } from "./_utils.js";

const SYS_PROMPT = `
Du är en skicklig författare. 
Skriv korta berättelser på svenska baserat på användarens idé, vald nivå och längd.
Nivå 1 = oskyldig/romantisk, Nivå 3 = sensuell, Nivå 5 = explicit.
Anpassa innehåll, stil och detaljer till nivå.
Variera språk så att berättelserna känns naturliga och flytande, undvik upprepningar.
`;

// Huvudfunktion
export async function onRequest(context) {
  const { request, env } = context;

  // Preflight (CORS)
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Use POST" }, 405, request);
  }

  try {
    // --- 1. Läs payload ---
    const body = await request.json().catch(() => ({}));
    const idea = (body.idea || "").trim();
    const level = parseInt(body.level, 10) || 1;
    const minutes = parseInt(body.minutes, 10) || 1;

    if (!idea) {
      return jsonResponse({ ok: false, error: "Missing 'idea'" }, 400, request);
    }
    if (![1, 3, 5].includes(level)) {
      return jsonResponse({ ok: false, error: "Invalid 'level'" }, 400, request);
    }
    if (![5, 10, 15].includes(minutes)) {
      return jsonResponse({ ok: false, error: "Invalid 'minutes'" }, 400, request);
    }

    // --- 2. Bygg prompt ---
    const tokensTarget = Math.round(minutes * 200); // ~200 ord/min
    const prompt = `${SYS_PROMPT}\n\nIdé: ${idea}\nNivå: ${level}\nLängd: ${minutes} min\n`;

    // --- 3. Kalla OpenAI Responses API ---
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: SYS_PROMPT },
          { role: "user", content: prompt }
        ],
        max_output_tokens: tokensTarget
      })
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      return jsonResponse(
        { ok: false, error: "OpenAI error", detail: errTxt },
        res.status,
        request
      );
    }

    // --- 4. Tolka svar ---
    const data = await res.json().catch(() => ({}));
    let story = "";

    if (data.output && data.output.length > 0) {
      const first = data.output[0];
      if (first.content && first.content.length > 0) {
        story = first.content[0].text || "";
      }
    }

    if (!story) {
      story = "(ingen text genererades)";
    }

    return jsonResponse({ ok: true, story }, 200, request);
  } catch (err) {
    return serverError(err, request);
  }
}
