// functions/api/generate-part.js

// ── Inlinade utils (ersätter import av ./_utils.js) ─────────────────────────────
function corsHeaders(request, extra = {}) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-expose-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra
  };
}
function jsonResponse(payload, status = 200, request, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(request, extra)
  });
}
function badRequest(msg = "bad request", request) {
  return jsonResponse({ ok: false, error: msg }, 400, request);
}
function serverError(err = "server error", request) {
  const detail = typeof err === "string" ? err : (err?.message || "error");
  return jsonResponse({ ok: false, error: detail }, 500, request);
}
// ────────────────────────────────────────────────────────────────────────────────

export async function onRequestPost({ request, env }) {
  try {
    const {
      idea,
      level,
      minutes,
      partIndex,
      totalParts,
      prevTail
    } = await request.json();

    if (!idea || !minutes || typeof partIndex !== "number" || !totalParts) {
      return badRequest("saknar nödvändiga fält (idea/minutes/partIndex/totalParts)", request);
    }

    // approx 320–400 tokens ≈ ~1 min svensk uppläsning (beror på röst/tempo)
    const tokensPerPart = 900; // justerat upp något så varje del blir lite längre
    const prompt = [
      `Detta är del ${partIndex + 1} av ${totalParts} i en erotisk berättelse på svenska.`,
      `Nivå: ${level}.`,
      `Idé: ${idea}.`,
      prevTail ? `Föregående avslutning: "${prevTail}".` : ``,
      ``,
      `Fortsätt berättelsen med flyt, utan klyschor och utan att upprepa tidigare fraser.`,
      `Använd naturlig, idiomatisk svenska (inga direkta översättningar).`,
      `Undvik fraser som "doft av ceder och rök". Variera bilder och rytm.`,
      `Avsluta delen med en tydlig men mjuk övergång till nästa del.`
    ].filter(Boolean).join("\n");

    // primär: OpenAI Responses
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: "Skriv i naturlig svensk prosa. Variera meningarnas längd och undvik upprepningar." },
          { role: "user", content: prompt }
        ],
        max_output_tokens: tokensPerPart
      })
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      return serverError(`OpenAI error: ${res.status} ${errTxt}`, request);
    }

    const data = await res.json();

    // plocka ut texten från Responses-schemat
    let text = "";
    if (data?.output && data.output.length > 0) {
      const first = data.output[0];
      if (first?.content && first.content.length > 0) {
        text = first.content[0]?.text || "";
      }
    }
    if (!text) return serverError("tomt svar från LLM", request);

    // skicka tillbaka sista ~200 tecken så nästa del kan få en mjuk övergång
    const tail = text.slice(-200);

    return jsonResponse(
      { ok: true, partIndex, totalParts, text, tail },
      200,
      request
    );

  } catch (err) {
    return serverError(err, request);
  }
}
