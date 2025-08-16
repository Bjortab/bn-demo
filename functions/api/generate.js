// /functions/api/generate.js
// Generera berättelsetext via Mistral (om MISTRAL_API_KEY finns) annars OpenAI.
// Inkluderar 60s timeout för att undvika "Fetch is aborted".

export const onRequestPost = async ({ request, env }) => {
  try {
    const { idea = "", level = 1, minutes = 5 } = await request.json();

    if (typeof idea !== "string" || !idea.trim()) {
      return new Response(JSON.stringify({ error: "empty_idea" }), { status: 400 });
    }

    // Ord/min uppskattning
    const targetWords = Math.max(140, Math.min(900, Math.round(minutes * 170)));

    // En enkel styrning av ton baserat på nivå 1–5
    const toneByLevel = {
      1: "romantiskt, antydande och icke-grafiskt; undvik explicita ord.",
      2: "varm och sensuell, lätt antydande; undvik grafiska detaljer.",
      3: "tydligt sensuell med måttliga detaljer; fortfarande elegant.",
      4: "hetare, konkreta detaljer i text men utan direkt rå pornografi.",
      5: "mycket het, vuxen och samtyckande; tillåt explicita svenska ord (t.ex. kuk, fitta, kåt, sköte, lem, slicka, våt, tränga in, suga, rida) men håll det respektfullt och icke-våldsamt."
    };

    // Lätt viktning för att tvinga in fraser på nivå 5
    const level5Lexicon = [
      "hans erigerade lem", "hennes våta sköte", "glida in", "trängde djupt",
      "slickade mig", "suga av", "rida honom", "stöt efter stöt",
      "pulserande njutning", "kåt", "våt", "orgasmen byggdes upp", "han kom",
      "hon kom", "ta mig hårdare", "hennes safter", "känna honom i mig"
    ];

    const systemPrompt = [
      "Du är en skicklig svensk berättare som skriver sensuella ljudnoveller för vuxna.",
      "Alltid samtycke. Inga minderåriga. Inget våld. Inga olagligheter.",
      `Längd: cirka ${targetWords} ord.`,
      `Ton (nivå ${level}): ${toneByLevel[level] || toneByLevel[1]}`,
      "Skriv i presens, andhämtning, blickar och beröring, med naturligt flyt.",
      "Avsluta snyggt – inte tvärt mitt i en mening."
    ].join("\n");

    const userPrompt = [
      `Idé från användaren: "${idea.trim()}".`,
      level === 5
        ? `Använd några av följande uttryck naturligt där det passar (inte alla, men minst 3–6): ${level5Lexicon.join(", ")}.`
        : "Undvik grovt språk på denna nivå.",
      "Skriv ihop en sammanhängande berättelse, inte punktlista."
    ].join("\n");

    const signal = AbortSignal.timeout(60000); // 60s timeout

    // ---- Mistral först om nyckel finns ----
    if (env.MISTRAL_API_KEY) {
      const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "mistral-large-latest",
          temperature: level >= 4 ? 0.95 : 0.8,
          top_p: 0.95,
          max_tokens: 2048,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        }),
        signal
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return new Response(JSON.stringify({ error: "mistral_error", detail: text }), { status: 502 });
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || "";
      if (!text) return new Response(JSON.stringify({ error: "empty_text" }), { status: 502 });

      return new Response(JSON.stringify({ text }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // ---- OpenAI fallback (om du saknar Mistral) ----
    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "no_provider_key" }), { status: 500 });
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: level >= 4 ? 0.95 : 0.8,
        top_p: 0.95,
        max_tokens: 2048,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      }),
      signal
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: "openai_error", detail: text }), { status: 502 });
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!text) return new Response(JSON.stringify({ error: "empty_text" }), { status: 502 });

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "timeout" : (err?.message || "unknown");
    return new Response(JSON.stringify({ error: "server_error", detail: msg }), { status: 500 });
  }
};
