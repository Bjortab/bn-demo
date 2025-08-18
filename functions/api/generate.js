// /functions/api/generate.js
export default {
  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ ok:false, error:"method_not_allowed" }), { status: 405 });
      }
      const { idea = "", level = 2, minutes = 5 } = await request.json();
      const min = Math.max(1, Math.min(15, Number(minutes) || 5));
      const lvl = Math.max(1, Math.min(5, Number(level) || 2));
      if (!idea.trim()) {
        return new Response(JSON.stringify({ ok:false, error:"empty_idea" }), { status: 400 });
      }

      const targetWords = Math.round(min * 170);
      const minWords = Math.max(220, Math.round(targetWords * 0.9));
      const maxWords = Math.round(targetWords * 1.1);

      // Lexikon per nivå – tvingas in med “MUST USE ...”
      const soft = [
        "varsamma händer", "lätta beröringar", "blickar som dröjer sig kvar", "hjärtat slog snabbare",
        "värme som växte", "läppar som möttes", "mjuk viskning", "pirrande förväntan", "kroppar nära", "andas i takt"
      ];
      const warm = [
        "hetare kyssar", "händer som utforskar", "läppar mot halsen", "fingrar som letar sig in under tyget",
        "ryggradens båge", "värme mellan låren", "hon drog honom närmare", "han pressade henne mjukt mot väggen",
        "bett på underläppen", "dov längtan i rösten"
      ];
      const hot4 = [
        "hennes våta sköte", "han trängde långsamt in", "vågor av njutning", "höfter som möter",
        "tungan som cirklar", "fingrar som glider i rytm", "han tog tag om hennes höfter",
        "hennes stön blev djupare", "de tappade andan", "hon red honom i stadig takt"
      ];
      const explicit5 = [
        "hans kuk gled in och ut", "hennes fitta pulserade runt honom", "han slickade hennes klitoris",
        "hon red honom hårt", "han kom djupare för varje tag", "hon var blöt och hungrig",
        "han grep hennes höfter och ökade tempot", "hans tunga lekte med hennes klitoris",
        "hon kom i vågor", "han fyllde henne med sin hetta"
      ];

      const mustUseByLevel = {
        1: soft,
        2: warm,
        3: warm.concat(soft),
        4: hot4,
        5: explicit5.concat(hot4) // 5 = MER explicit + 4:ans intensitet
      };

      // Säkra att #5 verkligen använder grova termer
      const mustCount = (lvl === 5) ? 6 : (lvl === 4 ? 4 : 2);

      const rules = `
Du skriver på svenska. Alltid vuxna och samtycke. Ingen våldtäkt, inga minderåriga, ingen incest.
Skapa EN sammanhängande erotisk novell i jag-form eller tredje person (håll dig konsekvent).
Mål: ${minWords}-${maxWords} ord. INGA cliffhangers.
Avsluta alltid med 1 kort avrundande mening som markerar efterspel/andhämtning.

NIVÅ: ${lvl}
— Ton:
1 = romantiskt antydande,
2 = varm, suggestiv,
3 = tydligt sensuell,
4 = explicit sensuell med fylliga kroppsliga beskrivningar,
5 = mest explicit språk (icke-grafiskt våldsamt — men grova ord tillåtna).

Du MÅSTE använda minst ${mustCount} element från listan nedan för nivå ${lvl}, vävda naturligt i texten (inte som lista):
${mustUseByLevel[lvl].map(s => `- ${s}`).join("\n")}
      `.trim();

      const user = `
Idé/ingång: ${idea}

Skriv berättelsen nu. Håll tempus/person konsekvent. Undvik upprepningar.
      `.trim();

      // Kör Mistral om nyckel finns (friare innehåll)
      const timeoutMs = 60000;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort("timeout"), timeoutMs);

      let text = "";
      if (env.MISTRAL_API_KEY) {
        const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.MISTRAL_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "mistral-large-latest",
            temperature: (lvl >= 4 ? 0.9 : 0.75),
            max_tokens: 2048,
            messages: [
              { role: "system", content: rules },
              { role: "user", content: user }
            ]
          }),
          signal: ctrl.signal
        });
        clearTimeout(t);

        if (!r.ok) {
          const e = await r.text().catch(() => "");
          return new Response(JSON.stringify({ ok:false, error:"mistral_error", detail:e }), { status: 500 });
        }
        const data = await r.json();
        text = (data.choices?.[0]?.message?.content || "").trim();
      } else if (env.OPENAI_API_KEY) {
        // Fallback till OpenAI om Mistral saknas (kan ibland mildra explicita nivåer)
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: (lvl >= 4 ? 0.95 : 0.8),
            max_tokens: 2048,
            messages: [
              { role: "system", content: rules },
              { role: "user", content: user }
            ]
          }),
          signal: ctrl.signal
        });
        clearTimeout(t);

        if (!r.ok) {
          const e = await r.text().catch(() => "");
          return new Response(JSON.stringify({ ok:false, error:"openai_error", detail:e }), { status: 500 });
        }
        const data = await r.json();
        text = (data.choices?.[0]?.message?.content || "").trim();
      } else {
        return new Response(JSON.stringify({ ok:false, error:"no_model_key" }), { status: 500 });
      }

      if (!text) {
        return new Response(JSON.stringify({ ok:false, error:"empty_text" }), { status: 502 });
      }

      // Sista säkerhet: trimma till ungefärligt längdspann & lägg mjuk avslutning om saknas punkt på slutet
      const words = text.split(/\s+/);
      if (words.length > (maxWords + 50)) {
        text = words.slice(0, maxWords).join(" ");
        if (!/[.!?…]$/.test(text)) text += ".";
        text += " När andetagen lugnat sig låg de kvar en stund och log.";
      } else if (words.length < minWords && !/[.!?…]$/.test(text)) {
        text += " De drog ett djupt, delat andetag och lät stillheten bära dem i mål.";
      }

      return new Response(JSON.stringify({ ok:true, text }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (err) {
      const msg = (err?.message || "").toLowerCase().includes("abort") ? "timeout" : err?.message || "server_error";
      return new Response(JSON.stringify({ ok:false, error:"server_error", detail: msg }), { status: 500 });
    }
  }
};
