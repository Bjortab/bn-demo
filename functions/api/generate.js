const WORDS_PER_MIN = 170;

function buildSystemPrompt() {
  return [
    "Du är en skicklig berättarröst som skriver sensuella, vuxna noveller för Blush Narratives.",
    "Alltid strikt 18+ och samtycke. Inga minderåriga, inga verkliga, identifierbara personer.",
    "Undvik överdriven vulgaritet; håll det stilfullt och sensuellt. Dialog och detaljer ska kännas mänskliga.",
    "Följ nivåpolicy:",
    "• Nivå 1: lätt, romantisk ton med antydningar.",
    "• Nivå 3: tydligare sensualitet, mer detaljer men balanserat.",
    "• Nivå 5: mest uttrycksfull med vuxna detaljer, respektfullt språk.",
  ].join("\n");
}

function buildUserPrompt({ prompt, level, detail, minutes }) {
  const wordsTarget = Math.max(400, Math.round((minutes || 5) * WORDS_PER_MIN));
  const detailGuide = [
    "Detalj 0–20: antydningar, mjuk stämning.",
    "Detalj 30–60: märkbar sensualitet, balans känsla/kropp.",
    "Detalj 70–100: vuxna, konkreta detaljer med samtycke."
  ].join("\n");

  return [
    `ANVÄNDARENS IDÉ: ${prompt}`,
    `MÅL: ca ${wordsTarget} ord (±10%).`,
    "Struktur: början (krok), mitt (uppbyggnad), slut (tillfredsställande).",
    "Språk: svenska, naturligt, med dialog där det passar.",
    `Nivå: ${level}.`,
    `Detaljnivå: ${detail}/100 (${detailGuide}).`,
    "Krav: 18+, samtycke, inga riktiga personer/kändisar, inget våld/tvång/olagligt.",
    "Svara endast med novelltexten.",
  ].join("\n");
}

async function generateWithOpenAI(env, promptText, systemText) {
  const apiKey = env?.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      messages: [
        { role: "system", content: systemText },
        { role: "user", content: promptText }
      ]
    }),
  });

  if (!res.ok) throw new Error(`OpenAI fel: ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  return text || null;
}

function fallbackText({ prompt, level, detail, minutes }) {
  const wordsTarget = Math.max(400, Math.round((minutes || 5) * WORDS_PER_MIN));
  const p = prompt.trim() || "En stilla kväll mellan två vuxna.";
  const toneL1 = ["varma blickar", "lätta beröringar", "romantisk ton"];
  const toneL3 = ["pirrig nyfikenhet", "långsamma andetag", "förväntan i kroppen"];
  const toneL5 = ["otålig lust", "handfasta rörelser", "intim närhet"];
  const tone = level >= 5 ? toneL5 : level >= 3 ? toneL3 : toneL1;

  const base = `${p} Allt beskrevs i vuxna, samtyckande drag. ${tone[0]} ledde till ${tone[1]}, och ${tone[2]} formade stämningen.`;
  let out = base;
  while (out.split(/\s+/).length < wordsTarget) out += " …";
  return out.replace(/\s+…/g, " …");
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok:false, error:"Use POST" }), {
        status: 405, headers: { "content-type": "application/json" }
      });
    }

    const body = await request.json().catch(()=> ({}));
    let { prompt = "", level = 3, detail = 50, minutes = 5 } = body;

    // Basvalidering
    prompt = String(prompt || "").slice(0, 2000);
    level = Math.max(1, Math.min(5, Number(level || 3)));
    detail = Math.max(0, Math.min(100, Number(detail || 50)));
    minutes = Math.max(3, Math.min(30, Number(minutes || 5)));

    const systemText = buildSystemPrompt();
    const userText = buildUserPrompt({ prompt, level, detail, minutes });

    let text = null;
    let source = "fallback";
    try {
      const maybe = await generateWithOpenAI(env, userText, systemText);
      if (maybe) { text = maybe; source = "ai"; }
    } catch {
      // fall back
    }
    if (!text) text = fallbackText({ prompt, level, detail, minutes });

    return new Response(JSON.stringify({ ok:true, source, text }), {
      headers: { "content-type": "application/json; charset=utf-8" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
}
