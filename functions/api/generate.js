// functions/api/generate.js
export const onRequest = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const level   = Number(url.searchParams.get("level") || 3);   // 1,3,5
    const minutes = Number(url.searchParams.get("min")   || 3);   // 1,3,5
    const mood    =        url.searchParams.get("mood")  || "romantisk";
    const seed    =        url.searchParams.get("seed")  || "";
    const idea    = (await request.text()) || "";

    // Lexikon (bundlas av Cloudflare)
    const lexicon = await import("../../github/lexicon.json", { assert: { type: "json" } });
    const L = lexicon.default || lexicon;
    const soft   = (L?.L4_SOFT || []).join(", ");
    const strong = (L?.L5_STRONG || []).join(", ");
    const banned = (L?.BLOCKED || []).join(", ");

    // ungefärlig längd
    const targetWords = Math.max(160, Math.min(230 * minutes, 1400));

    const system = [
      "Du är en svensk erotikförfattare.",
      "Skriv på naturlig, idiomatisk svenska. Undvik konstiga synonymer och direktöversättningar.",
      "Ton/explicithet:",
      "- Nivå 1: mild, sensuell, inga könsord.",
      "- Nivå 3/4: tydlig erotisk ton; begränsat med grova ord.",
      "- Nivå 5: explicit och rå; vanliga svenska könsord ok. Inga olagliga teman.",
      "Alltid: samtycke, vuxna personer; inga minderåriga, tvång, droger etc.",
      "Fokusera på flyt och naturlig meningsbyggnad.",
      "Undvik dessa: " + banned,
      level >= 5
        ? "Tillåtna råare ord/fraser (använd naturligt, inte spammat): " + strong
        : "Mjukare ord/fraser (sparsamt): " + soft
    ].join("\n");

    const user = [
      `Nivå: ${level}. Stämning: ${mood}. Längd: ~${minutes} min (~${targetWords} ord).`,
      seed ? `Utgå från denna idé: ${seed}` : "",
      idea ? `Lägg till: ${idea}` : "",
      "Skriv i presens, första person (kvinnligt perspektiv om inget annat anges).",
      "Växla mellan handling, dialog och känsla. Avsluta naturligt."
    ].filter(Boolean).join("\n");

    const model = env.OPENAI_MODEL || "gpt-4o-mini";
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return new Response(JSON.stringify({ ok:false, error:"Saknar OPENAI_API_KEY" }), { status: 500 });

    // 1) Utkast
    const genRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: level >= 5 ? 0.7 : 0.6,
        top_p: 0.9,
        presence_penalty: 0.4,
        frequency_penalty: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });
    const genJson = await genRes.json();
    if (!genRes.ok) throw new Error(genJson?.error?.message || "API-fel vid generering.");
    const draft = genJson?.choices?.[0]?.message?.content || "";

    // 2) Polish-pass (städar svenskan, behåller nivån)
    const polishRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content:
            "Du är en svensk textredaktör. Förbättra grammatiken, ordvalet och flytet till idiomatisk, sensuell svenska. " +
            "Byt ut konstiga/ovanliga ord mot naturliga uttryck. Behåll explicithetsnivån. Ändra inte innehållet." },
          { role: "user", content: `Rätta och putsa denna text, behåll nivå ${level}:\n\n${draft}` }
        ]
      })
    });
    const polishJson = await polishRes.json();
    if (!polishRes.ok) throw new Error(polishJson?.error?.message || "API-fel vid polish.");
    let finalText = polishJson?.choices?.[0]?.message?.content || draft;

    // 3) Enkel rensning mot bannade
    if (Array.isArray(L?.BLOCKED) && L.BLOCKED.length) {
      const re = new RegExp("\\b(" + L.BLOCKED.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "gi");
      finalText = finalText.replace(re, "");
    }

    return new Response(JSON.stringify({ ok:true, text: finalText }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok:false, error:String(err) }), { status:500 });
  }
};
