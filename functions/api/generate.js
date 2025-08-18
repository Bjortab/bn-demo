// functions/api/generate.js
// POST /api/generate  ->  { ok: true, text } eller { ok:false, error, detail }

export const onRequestPost = async ({ request, env }) => {
  const controller = new AbortController();
  const timeoutMs = 28000;
  const t = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    // 1) Läs & validera input
    const body = await request.json().catch(() => ({}));
    const idea = (body?.idea ?? "").toString().trim();
    const level = Number(body?.level ?? 3);
    const minutes = Number(body?.minutes ?? 5);

    if (!idea) return err(400, "empty_idea", "Saknar 'idea' (icke-tom sträng).");
    if (![1,2,3,4,5].includes(level))
      return err(400, "bad_level", "Level måste vara 1–5.");

    const targetWords = clamp(Math.round((isNaN(minutes)?5:minutes) * 170), 200, 900);

    // 2) Läs lexikon (fallback om saknas)
    let lex = { base:[], level1:[], level2:[], level3:[], level4:[], level5:[] };
    try {
      lex = (await import("../../lexicon.json", { assert: { type: "json" } })).default;
    } catch {}

    const base = Array.isArray(lex.base) ? lex.base : [];
    const pools = {
      1: uniq([...base, ...(lex.level1||[])]),
      2: uniq([...base, ...(lex.level1||[]), ...(lex.level2||[])]),
      3: uniq([...base, ...(lex.level1||[]), ...(lex.level2||[]), ...(lex.level3||[])]),
      4: uniq([...base, ...(lex.level1||[]), ...(lex.level2||[]), ...(lex.level3||[]), ...(lex.level4||[])]),
      5: uniq([...base, ...(lex.level1||[]), ...(lex.level2||[]), ...(lex.level3||[]), ...(lex.level4||[]), ...(lex.level5||[])]),
    };

    const style = {
      1: [
        "Ton: romantisk, antydande, inga grafiska detaljer.",
        "Fokus på stämning, blickar och pirr.",
        "Undvik explicita kroppstermer."
      ],
      2: [
        "Ton: mildt sensuell med försiktiga beröringar.",
        "Lätta konkreta detaljer, inte grafiskt."
      ],
      3: [
        "Ton: tydligt sensuell, konkreta detaljer men stilfullt.",
        "Alltid vuxna, samtycke och trygghet."
      ],
      4: [
        "Ton: het, direkt sensuell, tydliga handlingar och kroppskänsla.",
        "Alltid vuxna och samtycke. Undvik klyschor."
      ],
      5: [
        "Ton: mest het, handlingsdriven, inga omskrivningar.",
        "Använd ord/fraser från ordlistan där de passar naturligt.",
        "Alltid vuxna, tydligt samtycke och respekt."
      ]
    };

    const repetition = [
      "Undvik upprepning av samma bild/metafor.",
      "Variera sinnen: syn, hörsel, doft, smak, känsel.",
      "Håll berättarperspektivet konsekvent (jag/han/hon).",
      "Ge tydlig början, mitt och ett avrundat slut."
    ];

    const vocabHint = pools[level]?.length
      ? `Ord/fraser som får förekomma (variera naturligt, inget tvång): ${sample(pools[level], 50).join(", ")}.`
      : "Variera ordvalet och undvik upprepningar.";

    const systemPrompt = [
      "Du skriver en kort svensk ljudnovell.",
      `Målord: ~${targetWords} (±15%).`,
      ...style[level],
      ...repetition,
      vocabHint
    ].join("\n- ");

    const userPrompt = [
      `Idé: "${idea}"`,
      "Skriv en sammanhängande novell i löpande svensk prosa.",
      "Avrunda med en naturlig slutmening."
    ].join("\n");

    // 3) Routning: OpenAI (1–3) / Mistral (4–5)
    if (level <= 3) {
      const OPENAI_API_KEY = (env.OPENAI_API_KEY || "").trim();
      if (!OPENAI_API_KEY) return err(500, "missing_openai_key", "OPENAI_API_KEY saknas.");

      const reqBody = {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 1024,
        temperature: level===1?0.6:level===2?0.8:0.9
        // OBS: inga presence/frequency_penalty här
      };

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify(reqBody),
        signal: controller.signal
      });

      if (!r.ok) return err(r.status, "openai_error", await readText(r));
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) return err(502, "empty_response", "OpenAI gav tomt svar.");
      return ok({ text });
    } else {
      const MISTRAL_API_KEY = (env.MISTRAL_API_KEY || "").trim();
      if (!MISTRAL_API_KEY) return err(500, "missing_mistral_key", "MISTRAL_API_KEY saknas.");

      const reqBody = {
        model: "mistral-large-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 1024,
        temperature: 0.95
        // OBS: absolut inga penalty-fält här
      };

      const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify(reqBody),
        signal: controller.signal
      });

      if (!r.ok) return err(r.status, "mistral_error", await readText(r));
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) return err(502, "empty_response", "Mistral gav tomt svar.");
      return ok({ text });
    }
  } catch (e) {
    const detail = e?.name === "AbortError" ? "timeout" : (e?.message || "unknown");
    return err(500, "server_error", detail);
  } finally {
    clearTimeout(t);
  }
};

// -------- helpers ----------
function ok(payload){ return new Response(JSON.stringify({ ok:true, ...payload }), { headers:{ "Content-Type":"application/json" } }); }
function err(status, error, detail){ return new Response(JSON.stringify({ ok:false, error, detail }), { status, headers:{ "Content-Type":"application/json" } }); }
function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function uniq(a){ return Array.from(new Set((a||[]).filter(Boolean))); }
function sample(a,n){ const x=[...(a||[])]; for(let i=x.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [x[i],x[j]]=[x[j],x[i]];} return x.slice(0, Math.max(0, Math.min(n, x.length))); }
async function readText(r){ try{ return (await r.text()).slice(0,2000);}catch{ return ""; } }
