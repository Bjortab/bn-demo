// functions/api/generate.js
// Cloudflare Pages Function – POST { prompt, level, detail, minutes }
// Sätter du OPENAI_API_KEY som Secret i Pages → använder OpenAI.
// Annars returnerar den en fallback-text så demo funkar ändå.

const WORDS_PER_MIN = 170;

function buildSystemPrompt() {
  return [
    "Du är en skicklig berättarröst som skriver sensuella, vuxna noveller för Blush Narratives.",
    "Alltid strikt 18+ och samtycke. Inga minderåriga, inga verkliga, identifierbara personer.",
    "Undvik överdriven vulgaritet; håll det stilfullt och sensuellt. Dialog och detaljer ska kännas mänskliga.",
    "Följ alltid användarens intentionsprompt, men förbättra flyt och trovärdighet.",
    "Respektera nivåpolicy:",
    "• Nivå 1: lätt, romantisk ton med antydningar. Fokus på stämning och närhet.",
    "• Nivå 3: tydligare sensualitet, mer detaljer men håll smakfull balans.",
    "• Nivå 5: mest uttrycksfull med vuxna detaljer, fortfarande samtycke, respektfullt språk.",
    "Om givna detaljer är orealistiska eller oetiska → omformulera till en etiskt ok, vuxen, samtyckande situation.",
  ].join("\n");
}

function buildUserPrompt({ prompt, level, detail, minutes }) {
  const wordsTarget = Math.max(400, Math.round((minutes || 5) * WORDS_PER_MIN));
  const detailGuide = [
    "Detalj 0–20: antydningar, mjuk stämning, minimala kroppsliga detaljer.",
    "Detalj 30–60: märkbar sensualitet, balans mellan känsla och kropp.",
    "Detalj 70–100: vuxna, konkreta detaljer men håll det respektfullt och med samtycke."
  ].join("\n");

  return [
    `ANVÄNDARENS IDÉ: ${prompt}`,
    "",
    `MÅL: Skriv en sammanhållen novell på ca ${wordsTarget} ord (±10%).`,
    "Strukturera med en naturlig båge: början (krokar in), mitt (uppbyggnad/stegring), avslut (tillfredsställande, ej abrupt).",
    "Språk: svenska, flytande och naturligt. Använd dialog när det känns rätt.",
    "",
    `Nivå: ${level} (se nivåpolicy i systemprompt).`,
    `Detaljnivå: ${detail}/100. Följ denna riktlinje:\n${detailGuide}`,
    "",
    "Krav:",
    "• Alltid vuxna (18+), uttryckligt samtycke, respektfullt språk.",
    "• Inga riktiga namn eller kändisar; gör karaktärer fiktiva.",
    "• Inget våld, tvång, ohälsa, eller olagliga teman.",
    "• Om tvekan: tona ner och styr till trygg, vuxen, samtyckande situation.",
    "",
    "Svara ENBART med den färdiga novelltexten (inga rubriker/instruktioner)."
  ].join("\n");
}

async function generateWithOpenAI(env, promptText, systemText) {
  const apiKey = env?.OPENAI_API_KEY;
  if (!apiKey) return null;

  // En enkel, robust request mot OpenAI Chat Completions.
  // Byt modellnamn om du vill; håll dig till en textstark, kostnadseffektiv modell.
  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,   // lite mer kreativt
      messages: [
        { role: "system", content: systemText },
        { role: "user", content: promptText }
      ]
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(()=>String(res.status));
    throw new Error(`OpenAI fel: ${res.status} ${err}`);
  }

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

  const para = [
    `${p} Allt beskrevs i vuxna, samtyckande drag. ${tone[0]} ledde till ${tone[1]}, och ${tone[2]} formade stämningen.`,
    "Kvällen utvecklades i ett tryggt tempo där bådas gränser respekterades. Språket hölls naturligt och varmt.",
    "Det är en fallback-text utan AI-skapade detaljer. När AI aktiveras genereras en full längdnovell."
  ].join(" ");

  // Gör den lite längre så den känns “färdig” även utan AI
  let out = para;
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

    // Basvalidering + policy
    prompt = String(prompt || "").slice(0, 2000);
    level = Math.max(1, Math.min(5, Number(level || 3)));
    detail = Math.max(0, Math.min(100, Number(detail || 50)));
    minutes = Math.max(3, Math.min(30, Number(minutes || 5)));

    // Snabb policy-check för några uppenbara fall.
    const ban = /(\bminderårig|\bunder\s*18|\b15\s*år|\bbarn|\bokonsensuell|\bicke[- ]samtycke)/i;
    if (ban.test(prompt)) {
      return new Response(JSON.stringify({
        ok:false,
        error:"Otillåten prompt. Endast vuxna (18+) och samtyckande scenarion.",
      }), { status: 400, headers: { "content-type": "application/json" }});
    }

    const systemText = buildSystemPrompt();
    const userText = buildUserPrompt({ prompt, level, detail, minutes });

    // Försök OpenAI om nyckel finns, annars fallback.
    let text = null;
    try {
      text = await generateWithOpenAI(env, userText, systemText);
    } catch (e) {
      // Fortsätt med fallback nedan
    }
    if (!text) text = fallbackText({ prompt, level, detail, minutes });

    return new Response(JSON.stringify({ ok:true, text }), {
      headers: { "content-type": "application/json; charset=utf-8" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
}
