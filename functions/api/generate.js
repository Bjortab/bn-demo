import { jsonResponse, corsHeaders, badRequest, serverError } from "./_utils.js";

function buildPrompt({ idea = "", level = 1, minutes = 5 }) {
  const targetTokens = Math.max(180, Math.min(3200, Math.round(minutes * 260)));
  const style =
    level >= 5 ? "explicit, rå, direkt (nivå 5) svenska, flyt" :
    level >= 4 ? "sensuell, tydlig (nivå 4) svenska, flyt" :
                 "romantisk, mjuk (nivå 1–3) svenska, flyt";

  const system = `Du skriver en kort erotisk novell på svenska. Stil: ${style}.
Undvik upprepningar, klichéer och direktöversatta engelska uttryck. Behåll naturlig dialog.`;
  const user = (idea && idea.trim()) ? `Utgå från idén: """${idea.trim()}"""` : "Skriv en fristående scen.";
  return { system, user, targetTokens };
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return badRequest("Use POST", request);
  if (!env.OPENAI_API_KEY) return serverError("OPENAI_API_KEY saknas", request);

  try {
    const { idea = "", level = 1, minutes = 5 } = await request.json().catch(() => ({}));
    const { system, user, targetTokens } = buildPrompt({ idea, level, minutes });

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [{ role: "system", content: system }, { role: "user", content: user }],
        max_output_tokens: targetTokens,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return jsonResponse({ ok: false, error: "LLM error", detail: t, status: res.status }, res.status, corsHeaders(request));
    }

    const data = await res.json();
    let story = "";
    if (data?.output?.length > 0) {
      const first = data.output[0];
      if (first?.content?.length > 0) {
        const leaf = first.content[0];
        story = typeof leaf === "string" ? leaf : (leaf.text || "");
      }
    }
    if (!story) return jsonResponse({ ok: false, error: "Empty story from model" }, 502, corsHeaders(request));

    return jsonResponse({ ok: true, story }, 200, corsHeaders(request));
  } catch (e) {
    return serverError(e?.message || "Unhandled", request);
  }
}
