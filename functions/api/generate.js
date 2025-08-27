// functions/api/generate.js
// GC v1.2 – robust parsing + Responses API + konsekvent CORS
import { json, corsHeaders, badRequest, serverError } from "./_utils.js";

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return badRequest("Use POST", request);

  if (!env.OPENAI_API_KEY) return serverError("OPENAI_API_KEY saknas i Cloudflare env", request);

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Ogiltig JSON i request body", request);
  }

  const idea    = (body?.idea ?? "").toString().trim();
  const level   = Number(body?.level ?? 3);
  const minutes = Number(body?.minutes ?? 5);
  const voice   = (body?.voice ?? "alloy").toString().trim();
  const tempo   = Number(body?.tempo ?? 1.0);

  if (!idea) return badRequest("idea saknas", request);
  if (![1,2,3,4,5].includes(level)) return badRequest("level måste vara 1..5", request);
  if (![5,10,15].includes(minutes)) return badRequest("minutes måste vara 5,10,15", request);

  // Grov uppskattning 200–220 ord/min -> ~260 tokens/min
  const tokensTarget = Math.max(300, Math.round(minutes * 260));

  // Systemprompt (håll neutral & kontrollerad – vi justerar ton per level i texten)
  const SYS = [
    "Du skriver svenska berättelser för uppläsning.",
    "Skriv sammanhängande, naturligt tal med rätt böjningar och flyt.",
    "Undvik upprepningar och översättningsklingande fraser.",
    "Anpassa intensitet efter nivå (1 = mild, 3 = sensuell, 5 = explicit).",
    "Avsluta med naturlig avrundning, inte avhugget.",
  ].join(" ");

  // “styrord” per nivå (enkelt; kan bytas mot lexikon-fil)
  const INTENSITY = {
    1: "mjuk, romantisk, låg intensitet, inga explicita ord.",
    2: "varm, sensuell, antydningar, fortfarande icke-explicit.",
    3: "sensuell med tydliga beskrivningar, men undvik grova ord.",
    4: "het, direkt, men ej grovt slang; korrekt anatomi och känsla.",
    5: "explicit, vuxet språk; håll god ton och undvik olagligt/innehåll mot policy.",
  };

  const user = [
    `Idé: ${idea}`,
    `Nivå: ${level} (${INTENSITY[level]})`,
    `Längd: cirka ${minutes} min uppläst.`,
    `Stil: sammanhängande tal, bra flyt, naturlig svenska.`,
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: SYS },
          { role: "user", content: user },
        ],
        max_output_tokens: tokensTarget,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return json({ ok: false, error: "LLM error", detail: txt, status: res.status }, res.status, corsHeaders(request));
    }

    const data = await res.json();
    // Robust extraktion av text oavsett schema
    let story = "";
    if (typeof data.output_text === "string" && data.output_text.trim()) {
      story = data.output_text.trim();
    } else if (Array.isArray(data.output) && data.output.length > 0) {
      const c = data.output[0]?.content;
      if (Array.isArray(c) && c.length > 0 && typeof c[0]?.text === "string") {
        story = c[0].text;
      }
    } else if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
      story = data.choices[0].message.content;
    }

    if (!story) {
      return json({ ok: false, error: "tomt svar från modell" }, 502, corsHeaders(request));
    }

    return json({ ok: true, text: story, meta: { tokensTarget, level, minutes, voice, tempo } }, 200, corsHeaders(request));
  } catch (err) {
    return serverError(err, request);
  }
}
