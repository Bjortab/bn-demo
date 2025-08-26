import { json, corsHeaders, badRequest, serverError } from "./_utils.js";

const SYS_PROMPT = `
Du skriver korta erotiska berättelser på svenska.
Anpassa intensitet efter nivån (1=väldigt mild, 3=medel, 5=explicit).
Skriv naturligt flyt, korrekt svenska, undvik upprepningar och robotfraser.
Maximera sammanhang: inledning -> upptrappning -> klimax -> mjuk uttoning.
Undvik förbjudna teman (icke samtycke, minderåriga, droger, våld som upphetsning).
`;

export async function onRequest(context) {
  try {
    const { request, env } = context;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request) });
    }
    if (request.method !== "POST") {
      return badRequest("Use POST");
    }

    const { idea = "", level = 3, minutes = 3 } = await request.json().catch(() => ({}));

    if (!env.OPENAI_API_KEY) return badRequest("OPENAI_API_KEY missing (Cloudflare env)");

    const tokensTarget = Math.max(120, Math.min(1800, Math.round(minutes * 250))); // ~250 wpm

    const userPrompt = `
Idé/anvisning: ${idea || "Skapa en fristående scen."}
Nivå: ${level}
Längd i minuter (ungefär): ${minutes}
Skriv på svenska.`;

    // OpenAI Responses API (text)
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: SYS_PROMPT },
          { role: "user", content: userPrompt }
        ],
        max_output_tokens: tokensTarget
      })
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      return json({ ok: false, error: "LLM error", detail: errTxt }, res.status, corsHeaders(request));
    }

    const data = await res.json();
    // Responses API returns { output_text, ... } in new schema
    const story = data.output_text ?? data.content?.[0]?.text ?? "";

    return json({ ok: true, story }, 200, corsHeaders(request));
  } catch (err) {
    return serverError(err);
  }
}
