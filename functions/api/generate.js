export const onRequest = async ({ request, env }) => {
  try {
    const { idea = "", level = 5, minutes = 3 } = await request.json();

    // Lexikon från repo
    const lexURL = new URL("../../lexicon.json", import.meta.url);
    const lexResp = await fetch(lexURL);
    const L = await lexResp.json();

    const soft = (L?.L4_SOFT || []).join(", ");
    const strong = (L?.L5_STRONG || []).join(", ");
    const banned = (L?.BLOCKED || []).join(", ");

    const targetWords = Math.max(160, Math.min(230 * Number(minutes || 3), 1400));

    const system = [
      "Du är en svensk erotikförfattare.",
      "Skriv på naturlig, idiomatisk svenska. Undvik konstiga synonymer och direktöversättningar.",
      "Alltid: samtycke och vuxna. Inga olagliga teman.",
      "Undvik: " + banned,
      (Number(level) >= 5)
        ? "Nivå 5: explicit och rå – använd vanliga svenska könsord naturligt, inte spam. Tillåtna fraser: " + strong
        : "Nivå 3–4: tydlig erotik utan överdrivet grovt språk. Du kan använda: " + soft
    ].join("\n");

    const user = [
      `Längd: ~${targetWords} ord.`,
      idea ? `Idé: ${idea}` : "Skapa en fristående scen.",
      "Skriv i jag-form (kvinnligt perspektiv om inget annat anges).",
      "Växla handling, dialog och känsla. Avsluta naturligt."
    ].join("\n");

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY saknas i Cloudflare env.");

    // 1) Utkast
    const gen = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{ "authorization":`Bearer ${apiKey}`, "content-type":"application/json" },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: Number(level) >= 5 ? 0.7 : 0.6,
        top_p: 0.9,
        presence_penalty: 0.3,
        frequency_penalty: 0.3,
        messages: [
          { role:"system", content: system },
          { role:"user", content: user }
        ]
      })
    });
    const genJson = await gen.json();
    if(!gen.ok) throw new Error(genJson?.error?.message || "Generering misslyckades");
    const draft = (genJson.choices?.[0]?.message?.content || "").trim();

    // 2) Polish-pass
    const pol = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{ "authorization":`Bearer ${apiKey}`, "content-type":"application/json" },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          { role:"system", content:
            "Du är svensk textredaktör. Putsa grammatiken och ordval till idiomatisk, sensuell svenska. " +
            "Behåll explicithetsnivå och innehåll. Ta bort konstiga ord och upprepningar." },
          { role:"user", content: draft }
        ]
      })
    });
    const polJson = await pol.json();
    if(!pol.ok) throw new Error(polJson?.error?.message || "Polish misslyckades");
    let finalText = (polJson.choices?.[0]?.message?.content || draft).trim();

    // 3) Snabb blocker-koll (belt & suspenders)
    if (Array.isArray(L?.BLOCKED) && L.BLOCKED.length) {
      const re = new RegExp("\\b(" + L.BLOCKED.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "gi");
      finalText = finalText.replace(re, "");
    }

    return new Response(JSON.stringify({ ok:true, text: finalText }), {
      headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok:false, error: String(err) }), {
      status: 500, headers: { "content-type":"application/json; charset=utf-8" }
    });
  }
};
