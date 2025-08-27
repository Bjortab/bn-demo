// functions/api/generate.js
import { corsHeaders, badRequest, serverError } from './_utils.js';

const SYS_POWER = `
Du skriver kort erotiska berättelser på svenska.
Anpassa intensitet efter nivå (nivå 1: mjukt, nivå 3: sensuellt, nivå 5: explicit).
Håll naturligt flyt; korrekt svenska; undvik onaturliga ordagranna översättningar.
Maximera sammanhang; undvik upprepning.
`;

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "API key saknas (Cloudflare env)" }), {
        status: 500, headers: corsHeaders
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return badRequest("POST body saknas eller inte JSON");
    }

    const idea = (body.idea || "").toString().slice(0, 800);
    const level = Number(body.level ?? 3);
    const minutes = Number(body.minutes ?? 3);

    const tokensTarget = Math.max(180, Math.round(minutes * 220)); // ~220 ord/min

    const prompt = `
Idé: ${idea || "(ingen idé)"}.
Nivå: ${level}. Längd: ca ${minutes} min. Skriv en sammanhängande berättelse i jag- eller tredjeperson på flytande svenska.
`;

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: SYS_POWER },
          { role: "user", content: prompt }
        ],
        max_output_tokens: tokensTarget
      })
    });

    // Läs alltid text först – OpenAI kan svara med text även vid fel
    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      // försök tolka fel som JSON
      let err = raw;
      try { err = JSON.parse(raw); } catch {}
      return new Response(JSON.stringify({ ok: false, error: err || res.statusText }), {
        status: res.status || 500, headers: corsHeaders
      });
    }

    // Försök tolka OK-svar som JSON
    let data;
    try { data = JSON.parse(raw); } catch {
      return serverError("Tjänsten returnerade ogiltig JSON");
    }

    // Nya schema: data.output[0].content[0].text
    let story = "";
    try {
      const first = data.output?.[0];
      story = first?.content?.[0]?.text || "";
    } catch {/* leave empty */}

    if (!story) {
      return serverError("Tomt innehåll från modellen");
    }

    return new Response(JSON.stringify({ ok: true, story }), {
      status: 200, headers: corsHeaders
    });
  } catch (e) {
    return serverError(e?.message || "Okänt fel");
  }
}

// Stöd även GET för snabb hälsokoll (valfritt)
export async function onRequestGet(context) {
  return new Response(JSON.stringify({ ok: true, v: "1.1.0", ts: Date.now() }), {
    headers: corsHeaders
  });
}
