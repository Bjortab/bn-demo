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
  const bad = (status, msg, extra) =>
    new Response(JSON.stringify({ ok: false, error: msg, ...extra }), { status, headers: CORS });

  try {
    if (!env.OPENAI_API_KEY) {
      return bad(500, "OPENAI_API_KEY saknas i Cloudflare (Pages → Settings → Variables).");
    }

    const body = await request.json().catch(() => ({}));
    const idea    = (body.idea ?? "").toString();
    const level   = Number(body.level ?? 3); // 1,3,5
    const minutes = Number(body.minutes ?? 3); // 1,3,5
    const voice   = (body.voice ?? "alloy").toString();

    if (![1,3,5].includes(level)) return bad(400, "Ogiltig nivå.");
    if (![1,3,5].includes(minutes)) return bad(400, "Ogiltig längd (1/3/5).");

    // Grovt: 180 tokens/min → 1 min ≈ 180, 3 min ≈ 540, 5 min ≈ 900
    const maxTokens = Math.max(120, Math.min(900, Math.round(180 * minutes)));

    // Tryck hårdare på nivåordning
    const levelHints = {
      1: "Håll det romantiskt och varsamt. Undvik råa ord. Fokus på känslor, samtycke och närhet.",
      3: "Sensuellt och tydligt men inte rått. Tillåt ord som beskriver lust, kropp och rörelse – men undvik grova könsord.",
      5: "Explicit nivå. TILLÅT rå vokabulär på svenska där det är naturligt i flowet: fitta, kuk, kåt, blöt, slicka, suga, tränga in, knulla, spruta, sperma, orgasm, stön, anal (om samtyckt). Undvik övergrepp/icke-samtycke/barn/droger. Använd variation så det inte blir upprepningar."
    };

    const system = [
      "Du skriver erotiska berättelser på svenska.",
      "Allt innehåll är mellan vuxna människor och tydligt samtycke uttrycks. Inga minderåriga, inget tvång, inga olagligheter.",
      `Nivåbeskrivning: ${levelHints[level]}`,
      "Berättelsen ska ha röd tråd, inledning → stegring → klimax → lugn efteråt.",
      "Skriv naturligt talad svenska som lämpar sig att läsas upp högt.",
      "Undvik upprepning och klichéer. Variera ordval."
    ].join(" ");

    // Din promptidé får påverka
    const user = idea?.trim()
      ? `Användaridé: ${idea}`
      : "Skriv en ny berättelse utan användaridé.";

    const payload = {
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user",   content: user }
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
      return bad(res.status, (data?.error?.message || data?.message || "OpenAI-fel."), { raw:data });
    }

    // Robust extraktion (output_text eller nya output[])
    let story = "";
    if (typeof data.output_text === "string" && data.output_text.trim()) {
      story = data.output_text.trim();
    } else if (Array.isArray(data.output)) {
      const parts = [];
      for (const blk of data.output) {
        if (Array.isArray(blk.content)) {
          for (const c of blk.content) {
            if ((c.type === "output_text" || c.type === "text") && c.text) parts.push(c.text);
          }
        }
      }
      story = parts.join("\n").trim();
    }

    if (!story) return bad(200, "EMPTY_STORY", { raw: data });

    return new Response(JSON.stringify({ ok: true, story, voice }), { headers: CORS });

  } catch (e) {
    return bad(500, String(e?.message || e));
  }
}
