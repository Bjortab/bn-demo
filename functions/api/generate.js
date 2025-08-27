// functions/api/generate.js
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost({ env, request }) {
  try {
    const bad = (status, msg) =>
      new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: CORS });

    if (!env.OPENAI_API_KEY) return bad(500, "OPENAI_API_KEY saknas i Cloudflare (Pages → Settings → Variables).");

    const body = await request.json().catch(() => ({}));
    const idea   = (body.idea ?? "").toString();
    const level  = Number(body.level ?? 3);
    const minutes = Number(body.minutes ?? 3);

    if (![1,3,5].includes(level)) return bad(400, "Ogiltig nivå.");
    if (![1,3,5].includes(minutes)) return bad(400, "Ogiltig längd (1/3/5).");

    // ca 220–260 wpm → 700–900 tokens per 5 min. Vi begränsar per demo.
    const maxTokens = Math.max(120, Math.min(900, Math.round(180 * minutes)));

    const system = [
      `Du skriver korta erotiska berättelser på svenska.`,
      `Nivå ${level}: 1=romantisk, 3=sensuell, 5=explicit.`,
      `Säker stil: samtycke, trygg ton, inga olagligheter eller övergrepp.`,
      `Variera uttryck, håll en röd tråd, undvik upprepningar.`
    ].join(" ");

    const payload = {
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user",   content: idea || "Skriv en kort berättelse." }
      ],
      max_output_tokens: maxTokens
    };

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    let data;
    try { data = await res.json(); }
    catch { return bad(res.status || 502, "Kunde inte tolka serversvar."); }

    if (!res.ok) {
      // Skicka tillbaka fel från OpenAI så vi ser vad som händer
      return bad(res.status, (data && (data.error?.message || data.message)) || "OpenAI-fel.");
    }

    // -------- Robust extraktion --------
    let story = "";
    if (typeof data.output_text === "string" && data.output_text.trim()) {
      story = data.output_text.trim();
    } else if (Array.isArray(data.output) && data.output.length) {
      // För nya Responses-schemat
      const txtParts = [];
      for (const block of data.output) {
        if (Array.isArray(block.content)) {
          for (const c of block.content) {
            if ((c.type === "output_text" || c.type === "text") && c.text) {
              txtParts.push(c.text);
            }
          }
        }
      }
      story = txtParts.join("\n").trim();
    }

    if (!story) {
      // Något gick fel – returnera rådata för felsökning i devtools
      return new Response(JSON.stringify({ ok: false, error: "EMPTY_STORY", raw: data }), { status: 200, headers: CORS });
    }

    return new Response(JSON.stringify({ ok: true, story }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: CORS
    });
  }
}
