// functions/api/generate.js
// Cloudflare Pages Function – textgenerering via Mistral
export const onRequestPost = async ({ request, env }) => {
  try {
    const { idea = '', minutes = 5, level = 2 } = await request.json();

    if (!idea || !String(idea).trim()) {
      return json({ error: 'empty_idea' }, 400);
    }

    const MISTRAL_API_KEY = env.MISTRAL_API_KEY;
    if (!MISTRAL_API_KEY) {
      return json({ error: 'missing_mistral_key' }, 500);
    }

    // Ordlistor (kortade för serverfilen – fyll på i din lokala version)
    const soft2 = [
      "långsam kyss","dov längtan","hans händer mot min rygg",
      "hennes läppar mot min hals","dofter i vinden","blickar som dröjer"
    ];
    const warm3 = [
      "fingrar följde siluetter","varma andetag mot huden",
      "hjärtat steg i takt","närmare, utan att hasta"
    ];
    const spicy4 = [
      "hennes våta sköte","hett mellan låren","kroppar som hungrar",
      "han fann rytmen","hon tog emot med låga ljud"
    ];
    const explicit5 = [
      "hans erigerade lem","våta skötet","gled långsamt in",
      "han trängde djupare","hon red honom","hon skrek hans namn",
      "han fyllde henne","hon pulserade runt honom"
    ];

    // Ordval per nivå (du kan blanda eller köra hårdare styrning)
    let lexicon = [];
    let tone = "Skriv med flytande, suggestivt språk. Undvik grafik bortom valda nivåns andemening.";
    switch (Number(level)) {
      case 1: tone = "Mycket mild, romantiskt antydande. Undvik kroppsliga detaljer."; lexicon = []; break;
      case 2: tone = "Mild och varm, sensuellt antydande, inga direkta ord för anatomi."; lexicon = soft2; break;
      case 3: tone = "Tydligt sensuell, fler taktila detaljer, men fortfarande elegans."; lexicon = warm3; break;
      case 4: tone = "Hetare, konkreta formuleringar, använd ord ur listan, undvik grafiska våldsskildringar."; lexicon = spicy4; break;
      case 5: tone = "Maximalt hett utan grafiskt våld. Använd uttryck ur listan nedan flera gånger naturligt i texten."; lexicon = explicit5; break;
      default: lexicon = soft2;
    }

    const wordsHint = lexicon.length
      ? `Prioritera att väva in uttryck från denna lista där det känns naturligt: ${lexicon.join(", ")}.`
      : `Håll dig romantisk och antydande utan direkta anatomiska ord.`;

    const targetWords = Math.max(180, Math.min(900, Math.round(Number(minutes || 5) * 170)));

    const system = [
      "Du skriver på naturlig svenska.",
      "Allt sker mellan vuxna med samtycke.",
      "Ingen minderårig, inget tvång, inget våld.",
      tone,
      wordsHint
    ].join("\n");

    const user = [
      `Idé: ${String(idea).trim()}`,
      `Målomfång: cirka ${targetWords} ord.`,
      "Struktur: snabb inledning, upptrappning, höjdpunkt, mjuk landning.",
      "Skriv i presens eller preteritum – välj det som flyter bäst.",
      "Undvik upprepningar; variera uttryck och bilder.",
      "Skriv direkt som en sammanhängande berättelse utan rubriker."
    ].join("\n");

    // Mistral chat.completions
    const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "open-mixtral-8x7b", // bra allround under Experiment
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        max_tokens: 2048,
        temperature: 0.9,
        top_p: 0.95
      })
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(()=> '');
      return json({ error: 'mistral_failed', detail: txt }, 502);
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return json({ error: 'empty_text' }, 502);

    // Utdrag (för snabbvisning)
    const excerpt = text.split(/\s+/).slice(0, 70).join(' ') + ' …';

    return json({ text, excerpt }, 200);
  } catch (err) {
    return json({ error: 'server_error', detail: String(err) }, 500);
  }
};

// Hjälpare för JSON-svar
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
