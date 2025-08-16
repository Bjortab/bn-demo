// functions/api/generate.js
// CommonJS för Cloudflare Pages Functions
module.exports = {
  async onRequestPost({ request, env }) {
    try {
      const { idea = "", level = 3, minutes = 5 } = await request.json();

      // Säkerhetsräcken
      if (!idea || typeof idea !== "string") {
        return new Response(JSON.stringify({ error: "empty_idea" }), { status: 400 });
      }
      if (!env.MISTRAL_API_KEY) {
        return new Response(JSON.stringify({ error: "missing_mistral_key" }), { status: 500 });
      }

      // Ord-mål: ca 170 ord/minut
      const targetWords = Math.max(120, Math.min(1800, Math.round(minutes * 170)));

      // Ton per nivå (5 mycket tydlig, 1 mild)
      const toneByLevel = {
        1: "Mycket mild, romantisk och antydande. Undvik grafiska detaljer.",
        2: "Varm, mjuk sensualism. Några försiktiga antydningar.",
        3: "Tydligt sensuell med måttliga detaljer, fortfarande elegant.",
        4: "Sensuellt och direkt, konkreta detaljer. Ändå stilfullt.",
        5: "Het, explicit men respektfull. Samtycke, vuxna, trygghet. Undvik nedsättande ord."
      };

      // Listor för nivå 4–5 (tvingar in variation och våra nyckelord)
      const softLex = [
        "pirrande värme", "långsam kyss", "dov längtan", "hans händer mot min rygg",
        "hennes andetag mot min hals", "förväntan i blicken"
      ];

      const hotLex = [
        "hans lem", "hans erigerade lem", "våt slida", "mitt sköte", "mitt våta sköte",
        "trångt och varmt", "slickade mig", "med tungan", "hon red honom",
        "han trängde in", "djupare rytm", "snabbare stötar", "pulserande njutning",
        "han kom i mig", "hon kom hårt", "safterna rann", "hans fingrar i mig",
        "jag strök honom hårt", "han gled i mig", "vi tappade andan", "frustande",
        "jag spände höfterna", "hennes knän kring min midja"
      ];

      // Bygg prompten (svenska, säkerhet, längd, ton + ordlista)
      const system =
        "Du är en svensk författare av korta erotiska ljudnoveller. Skriv alltid på svenska. " +
        "Alltid: vuxna, samtycke, trygghet. Inga minderåriga, inget tvång, inget våld.";

      // Pusha ordlistor enligt nivå
      const lexExtra =
        level >= 5
          ? `Använd flera av dessa uttryck naturligt: ${hotLex.join(", ")}.`
          : level === 4
          ? `Använd några av dessa uttryck: ${hotLex.slice(0, 10).join(", ")}.`
          : `Valfria mjuka uttryck: ${softLex.join(", ")}.`;

      const userContent =
        `Idé: ${idea}\n` +
        `Mål: cirka ${targetWords} ord (±15%).\n` +
        `Ton: ${toneByLevel[level] || toneByLevel[3]}.\n` +
        `${lexExtra}\n` +
        `Avsluta utan efterord eller rubriker; skriv en sammanhållen berättelse i jag-form eller tredjeperson.`;

      // Mistral chat completions
      const body = {
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ],
        temperature: 0.95,
        max_tokens: Math.min(4000, Math.round(targetWords * 1.6)), // säker marginal
        top_p: 0.95
      };

      const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const errTxt = await resp.text();
        return new Response(JSON.stringify({ error: "mistral_error", detail: errTxt }), { status: 502 });
      }

      const data = await resp.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || "").trim();

      if (!text) {
        return new Response(JSON.stringify({ error: "empty_text" }), { status: 502 });
      }

      return new Response(JSON.stringify({ ok: true, text }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "server_crash", detail: String(e) }), { status: 500 });
    }
  }
};
