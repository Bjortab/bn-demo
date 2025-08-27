// functions/api/generate.js
import { json, corsHeaders, badRequest, serverError } from "./_utils.js";

const MODEL = "gpt-4o-mini";

// Robust parser: plockar text oavsett schema
function pickTextFromResponses(data) {
  try {
    if (!data || typeof data !== "object") return "";

    // 1) Nyare schema
    if (Array.isArray(data.output_text) && data.output_text.length) {
      return data.output_text.join("\n\n").trim();
    }

    // 2) output[*].content[*].text
    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (Array.isArray(item?.content)) {
          for (const c of item.content) {
            if (typeof c?.text === "string" && c.text.trim()) {
              return c.text.trim();
            }
            if (c?.type === "output_text" && typeof c?.text === "string") {
              return c.text.trim();
            }
            if (Array.isArray(c?.content)) {
              for (const inner of c.content) {
                if (typeof inner?.text === "string" && inner.text.trim()) {
                  return inner.text.trim();
                }
              }
            }
          }
        }
      }
    }

    // 3) Chat/choices
    const chat = data?.choices?.[0]?.message?.content;
    if (typeof chat === "string" && chat.trim()) return chat.trim();

    // 4) Som sista utväg
    if (typeof data?.text === "string") return data.text.trim();
  } catch {
    // ignorera
  }
  return "";
}

export async function onRequest({ request, env }) {
  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return badRequest("Use POST");

  try {
    if (!env?.OPENAI_API_KEY) return badRequest("OPENAI_API_KEY saknas");

    const body = await request.json().catch(() => ({}));
    const idea = (body?.idea || "").toString().trim();
    const level = Number(body?.level || 3);
    const minutes = Number(body?.minutes || 5);

    // Rimlig tokenbudget (~ 200–250 ord/min ≈ ~260 tokens/min)
    const maxTokens = Math.max(400, Math.round(minutes * 260));

    const style =
      level >= 5
        ? "Skriv på svenska en explicit erotisk berättelse i jag-form. Tydlig, vuxen och grafisk stil, men utan övergrepp/icke-samtycke, minderåriga eller droger. Flytande språk utan stapplande upprepningar."
        : "Skriv på svenska en erotisk men icke-grafisk berättelse i jag-form. Sensuell, varm och naturlig ton. Undvik övergrepp/icke-samtycke, minderåriga eller droger.";

    const sys = [
      style,
      "Variera ordval, undvik upprepningar, håll god svenska.",
      "Längd: anpassa så att den motsvarar cirka den angivna lyssningstiden.",
    ].join(" ");

    const user = idea || "Skapa en kort sensuell berättelse.";

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.9,
        max_output_tokens: maxTokens,
        input: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      return json(
        { ok: false, error: "LLM error", detail: errTxt, status: res.status },
        res.status
      );
    }

    const data = await res.json().catch(() => ({}));
    const story = pickTextFromResponses(data) || "";

    if (!story) {
      return json(
        { ok: false, error: "Tomt svar från modellen", detail: data },
        502
      );
    }

    return json({ ok: true, story });
  } catch (e) {
    return serverError(e);
  }
}
