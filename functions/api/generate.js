import { ok, err, readJson } from "./_utils.js";

export const onRequestPost = async (context) => {
  const { request, env } = context;
  const body = await readJson(request);
  const level = Number(body.level || 3);
  const minutes = Number(body.minutes || 3);
  const promptUser = String(body.prompt || "").slice(0, 1200);

  const OPENAI_API_KEY = env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return err("Missing OPENAI_API_KEY in environment", 500);

  // System prompt (säkerhet/ramar)
  const system = [
    "Du är en svensk berättarröst som skriver erotiska noveller.",
    "Skriv i jag-form, naturlig dialog, sensuell ton.",
    "Allt innehåll ska vara samtyckande och vuxet. Inga minderåriga eller förbjudna teman.",
    "Nivå 1 = romantisk. Nivå 3 = sensuell. Nivå 5 = explicit vuxet språk (lagligt & samtycke).",
    "Avsluta alltid med mjuk landning."
  ].join(" ");

  const lenGuide = minutes<=1?"120–180 ord":minutes===3?"350–500 ord":"650–900 ord";
  const levelGuide = {
    1: "romantisk, mjuk, subtil",
    2: "romantisk + lätt sensuell",
    3: "sensuell, tydligare detaljer",
    4: "tydligt sensuell, vuxet språk",
    5: "explicit vuxet språk, hög intensitet (lagligt & samtycke)"
  }[level] || "sensuell vuxen nivå";

  const user = [
    `Skriv en svensk berättelse (${lenGuide}).`,
    `Ton/intensitet: ${levelGuide}.`,
    promptUser ? `Utgå från idén: ${promptUser}` : "Skapa en attraktiv startscen i hemmiljö.",
    "Använd stycken och naturligt flyt."
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "authorization": `Bearer ${OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.9,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!res.ok) {
      const t = await res.text().catch(()=> "");
      return err(`OpenAI error ${res.status}: ${t.slice(0,300)}`, res.status);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "(tomt svar)";
    return ok({ ok: true, text });
  } catch (e) {
    return err("Network error: "+e.message);
  }
};
