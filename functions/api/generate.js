// functions/api/generate.js

// ── Inlinade utils ──────────────────────────────────────────────────────────────
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

function buildSystemPrompt(level) {
  const base = [
    "Du skriver en sammanhängande berättelse på naturlig svenska.",
    "Variera rytm och meningslängd, undvik klyschor, undvik upprepningar.",
    "Fokusera på känsla, blick, beröring och tempo; inte parfym-klichéer."
  ];
  if (level >= 4) {
    base.push("Nivå 4–5: tillåt explicit terminologi men utan grovt språk för sakens skull.");
  } else {
    base.push("Nivå 1–3: håll det sensuellt men icke-explicit.");
  }
  return base.join(" ");
}

export async function onRequest({ request, env }) {
  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return badRequest("Use POST", request);

  try {
    const body = await request.json();
    const { idea, level = 3, minutes = 5 } = body || {};
    if (!idea) return badRequest("saknar 'idea'", request);

    const tokensTarget = Math.min(1600, Math.round((minutes * 380))); // ~380 tok/min

    const sys = buildSystemPrompt(level);

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: sys },
          { role: "user", content: `Idé: ${idea}\nSkriv hela berättelsen i en följd.` }
        ],
        max_output_tokens: tokensTarget
        // OBS: inga presence/frequency_penalty här (det gav 400 för dig)
      })
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return serverError(`openai_${res.status}: ${txt}`, request);
    }

    const data = await res.json();

    let story = "";
    if (data?.output?.length > 0) {
      const first = data.output[0];
      if (first?.content?.length > 0) {
        story = first.content[0]?.text || "";
      }
    }
    if (!story) return serverError("tomt svar från LLM", request);

    return jsonResponse({ ok: true, text: story }, 200, request);

  } catch (err) {
    return serverError(err, request);
  }
}
