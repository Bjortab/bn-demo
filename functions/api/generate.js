// functions/api/generate.js
// Cloudflare Pages Functions (Edge Runtime)

export const onRequestPost = async ({ request, env }) => {
  try {
    const { idea = "", level = 1, minutes = "short", avoid = [] } = await request.json();

    if (!idea || !String(idea).trim()) {
      return json({ ok: false, error: "empty_idea" }, 400);
    }

    // API keys
    const OPENAI = env.OPENAI_API_KEY || "";
    const MISTRAL = env.MISTRAL_API_KEY || "";

    // ord/min & ungefärlig mål-längd
    const mins = minutes === "long" ? 20 : minutes === "medium" ? 10 : 5;
    const targetWords = Math.min(180 * mins, 900); // övre gräns så TTS inte blir för tung

    // Bas-toner per nivå (inkluderar överlapp för mer naturlig stegring)
    const toneByLevel = {
      1: "romantiskt, antydande, lågmält sensuellt, fokusera på blickar, nerv, dofter, händer som snuddar; inga grafiska detaljer.",
      2: "mild, varm erotisk stämning, kyssar, beröring, andning, händernas rörelser, underförstådd lust; undvik explicita könsord.",
      3: "tydligt erotiskt, tydliga kyssar, händer under kläder, tungkyssar, avklädning; måttliga uttryck, fortfarande poetiskt.",
      4: "hett, explicit men respektfullt, tydliga sexuella handlingar och kroppsliga reaktioner; använd vuxna uttryck på svenska.",
      5: "mycket hett, explicit men aldrig våldsamt; direkta ordval för kroppar och handlingar; håll god ton och samtycke tydligt."
    };

    // Vokabulär per nivå (nivåer nedan är kumulativa via buildLexicon)
    const L1 = [
      "blickar möts","värmen mellan oss","hud mot hud","tystnad som säger allt","nerv i kroppen",
      "läppar som dröjer","fingrar längs armen","andhämtning som hakar upp sig","värmande doft","pirr under huden",
      "hand som möter min","ett leende nära","hjärtat rusar","förväntan i luften","natten omsluter oss"
    ];
    const L2 = [
      "läppar mot halsen","tungan snuddar","händer i håret","tröjan glider upp","midjan i mitt grepp",
      "knappar som lossnar","ryggen mot väggen","doften kommer nära","värmen mellan låren","andningen djupnar",
      "händer som utforskar","kroppen svarar","stönen blir mjuka","tiden försvinner","vi ger efter"
    ];
    const L3 = [
      "kyssen blir våt","bröstvårtorna hårdnar","handen innanför","tyget ger efter","munnen söker mer",
      "tänder som retas","höfter som möts","fingrar mellan låren","slickar längs huden","svetten doftar söt",
      "ryck i andningen","händer om mina skinkor","jag leder hen","hen drar mig närmare","vi faller i sängen"
    ];
    // Här kan du fylla på nivå 4–5 med egna ord. Jag lägger in neutralare placeholders
    // + backend respekterar en avoid-lista från klienten så “nyckelben” m.fl. inte spammar.
    const L4 = [
      "han glider in långsamt","hon rider mig","jag slickar henne","han tar mig bakifrån",
      "hon kramar mig med benen","jag suger honom","djupa stötar","vi tappar kontrollen",
      "fukt som rinner","vi kommer nästan samtidigt","han håller om mina höfter","hon fångar min rytm",
      "jag vibrerar mot henne","han fyller mig","hon skakar av njutning"
    ];
    const L5 = [
      // Byt gärna ut/komplettera med dina egna explicitare fraser.
      "hans lem är hård","hennes sköte är vått","jag slickar hennes klitoris",
      "jag tar honom djupt i munnen","han pressar in mig helt","jag rider honom hårt",
      "våra kroppar slår mot varandra","hennes safter rinner över mig","min tunga cirklar runt hennes klitoris",
      "han fyller mig till botten","hon spänner sig runt mig","jag pulserar i henne","hon ropar mitt namn när hon kommer",
      "vi skakar när det lossnar","vi faller ihop, glödheta"
    ];

    function buildLexicon(lv) {
      if (lv <= 1) return L1;
      if (lv === 2) return L1.concat(L2);
      if (lv === 3) return L1.concat(L2, L3);
      if (lv === 4) return L1.concat(L2, L3, L4);
      return L1.concat(L2, L3, L4, L5);
    }

    const lexicon = buildLexicon(Number(level));

    // Slumpa ur lexikon med undvikande (avoid) och begränsa hur många vi “låser in” i prompten
    function pickPhrases(n) {
      const pool = lexicon.filter(p => !avoid?.some(x => samePhrase(x, p)));
      shuffle(pool);
      return pool.slice(0, Math.min(n, pool.length));
    }
    function samePhrase(a,b){ return a.trim().toLowerCase() === b.trim().toLowerCase(); }
    function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } }

    // nivå→antal “måste förekomma” fraser att sprida ut
    const mustCount = {1:3,2:4,3:6,4:8,5:10}[Number(level)] || 4;
    const mustUse = pickPhrases(mustCount);

    const systemStyle = [
      "Du skriver på idiomatisk, korrekt och modern svenska.",
      "Var konsekvent med tempus och perspektiv (du/jag/han/hon).",
      "Inga barn/minor, inget våld, inget hat, inget icke-samtycke.",
      "Tydlig röd tråd: inledning, upptrappning, klimax, avrundning.",
      "Dialoger får gärna förekomma; markera med citattecken.",
      "Skriv rytmiskt med naturliga pauser; inga upprepningar av klyschor.",
    ].join(" ");

    const contentRules = [
      `Ton och detaljnivå: ${toneByLevel[level]}`,
      "Språk: alltid ren svenska, böjningar korrekt; undvik anglicismer.",
      `Längd: sikta på cirka ${targetWords} ord.`,
      `Undvik följande fraser/ord: ${avoid && avoid.length ? avoid.join(", ") : "(ingen särskild lista)"}`,
      `Försök sprida in dessa utan att överanvända dem (2–4 gånger totalt, variera): ${mustUse.join(", ")}`,
    ].join("\n");

    const userAsk = [
      `Idé: ${idea}`,
      `Skriv i jag-perspektiv eller tredje person konsekvent.`,
      "Avsluta berättelsen ordentligt (inte mitt i en mening).",
    ].join("\n");

    // 1) Råutkast
    const draft = await generateRaw({
      OPENAI, MISTRAL, level: Number(level),
      systemStyle, contentRules, userAsk,
      targetWords
    });

    // 2) Polish till idiomatisk svenska
    const polished = await polishSwedish({
      OPENAI, text: draft, targetWords
    });

    // Returnera text + vilka fraser vi använt (klienten lägger i localStorage för att undvika spam)
    return json({
      ok: true,
      story: polished,
      used_phrases: mustUse
    });

  } catch (err) {
    return json({ ok:false, error:"server_error", detail:String(err?.message||err) }, 500);
  }
};

// ===== helpers =====

async function generateRaw({ OPENAI, MISTRAL, level, systemStyle, contentRules, userAsk, targetWords }) {
  // nivå 4–5 → Mistral om nyckel finns, annars OpenAI; nivå 1–3 → OpenAI
  const useMistral = (level >= 4) && !!MISTRAL;

  const prompt = [
    systemStyle,
    "",
    "REGLER:",
    contentRules,
    "",
    "UPPGIFT:",
    userAsk
  ].join("\n");

  if (useMistral) {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${MISTRAL}` },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [
          { role:"system", content: systemStyle },
          { role:"user", content: prompt }
        ],
        temperature: 0.95,
        top_p: 0.9,
        max_tokens: 2048
      })
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error?.message || "mistral_error");
    return js.choices?.[0]?.message?.content?.trim() || "";
  } else {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${OPENAI}` },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: prompt,
        temperature: 0.95,
        frequency_penalty: 0.25,
        presence_penalty: 0.35,
        max_output_tokens: 2048
      })
    });
    const js = await res.json();
    if (!res.ok) throw new Error(js?.error?.message || "openai_error");
    return (js.output_text || "").trim();
  }
}

async function polishSwedish({ OPENAI, text, targetWords }) {
  if (!OPENAI) return text; // no-op fallback

  const polishPrompt =
    `Förbättra följande text till idiomatisk, korrekt svenska: rätt böjningar, ordföljd, flyt, rytm och naturlig dialog. ` +
    `Behåll betydelsen och värmen. Sikta på ~${targetWords} ord. Returnera endast ren text, inga förklaringar.\n\n` +
    text;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${OPENAI}` },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: polishPrompt,
      temperature: 0.6,
      max_output_tokens: 2048
    })
  });
  const js = await res.json();
  if (!res.ok) throw new Error(js?.error?.message || "polish_error");
  return (js.output_text || "").trim();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
