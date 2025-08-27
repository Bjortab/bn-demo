// functions/api/generate.js — GC (streaming) v1.0

import { jsonResponse, corsHeaders, badRequest, serverError } from "./_utils.js";

/**
 * POST /api/generate
 * Body: { idea: string, level: number, minutes: number }
 * Query: ?stream=1  -> strömmar som text/event-stream (SSE)
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
  if (!env?.OPENAI_API_KEY) {
    return serverError("OPENAI_API_KEY saknas i Cloudflare env", request);
  }

  let idea = "", level = 3, minutes = 5;
  try {
    const body = await request.json();
    idea    = (body?.idea ?? "").toString().trim();
    level   = Math.max(1, Math.min(5, Number(body?.level ?? 3)));
    minutes = [5,10,15].includes(Number(body?.minutes)) ? Number(body?.minutes) : 5;
  } catch (e) {
    // Ogiltig JSON från klient
    return badRequest("Body måste vara JSON", request);
  }

  // Token-budget (väldigt översiktligt, hellre för smått än för stort i demo)
  const targetTokens = Math.round(minutes * 200); // ca 200 ord/min

  // Systemprompt (håll den kort – längre prompt = långsammare och dyrare)
  const SYS = [
    "Du skriver sensuella berättelser på svenska.",
    `Nivå: ${level} av 5 (5 = explicit).`,
    "Skriv flytande, naturlig svenska. Undvik direkt översatt engelska.",
    "Variera fraser; undvik upprepningar. Ha tydlig dramaturgisk stegring.",
    "Avsluta med avrundning, inte tvärstopp."
  ].join(" ");

  const wantsStream = new URL(request.url).searchParams.get("stream") === "1";

  try {
    // Baspayload till OpenAI Responses API
    const payload = {
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: SYS },
        { role: "user",   content: idea || "Skriv en kort, sensuell berättelse." }
      ],
      max_output_tokens: targetTokens,
      temperature: 0.9,
      stream: !!wantsStream
    };

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return jsonResponse(
        { ok: false, error: "LLM error", detail, status: upstream.status },
        upstream.status,
        request
      );
    }

    if (wantsStream) {
      // PASS-THROUGH STREAM (SSE)
      // Vi strömmar vidare OpenAI:s SSE som-är (snabbast och enklast).
      return new Response(upstream.body, {
        headers: corsHeaders(request, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store"
        })
      });
    }

    // Fallback: icke-stream (vanlig JSON)
    const data = await upstream.json();

    // För Responses-API i icke-stream: plocka första textutgången robust
    let story = "";
    try {
      if (Array.isArray(data?.output) && data.output.length) {
        const piece = data.output[0];
        if (Array.isArray(piece?.content) && piece.content.length) {
          story = piece.content.map(x => x?.text ?? "").join("");
        } else if (piece?.text) {
          story = piece.text;
        }
      } else if (Array.isArray(data?.content)) {
        story = data.content.map(x => x?.text ?? "").join("");
      }
    } catch { /* håll tyst, story bli "" om fel */ }

    return jsonResponse({ ok: true, story }, 200, request);

  } catch (err) {
    const msg = typeof err === "string" ? err : (err?.message || "error");
    return serverError(msg, request);
  }
}
