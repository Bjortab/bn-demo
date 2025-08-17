// Cloudflare Pages Function: POST /api/generate
// Tar emot: { idea: string, level: 1|2|3|4|5, minutes: number }
// Returnerar: { ok: true, text: string } eller { ok: false, error, detail }

export async function onRequestPost({ request, env }) {
  try {
    const { idea = "", level = 2, minutes = 5 } = await request.json();

    if (!idea || typeof idea !== "string" || idea.trim().length === 0) {
      return json({ ok: false, error: "bad_request", detail: "empty_idea" }, 400);
    }
    const L = clamp(Number(level) || 2, 1, 5);
    const mins = clamp(Number(minutes) || 5, 1, 15); // 1–15 min
    const targetWords = Math.max(120, Math.min(170 * mins, 1200)); // ca 170 ord/min

    // —— Vår "riktiga ordbok" per nivå ——
    // OBS: lägg gärna till fler – detta är en start. Vi tvingar användning via prompten.
    const LIB = {
      1: [
        "blickar som dröjer kvar", "händer som möts", "mjuka rörelser",
        "hjärtan som slår i takt", "en varm närhet", "förväntansfull tystnad",
        "dofter som blandas", "läppar som nästan nuddar", "pirr längs ryggraden",
        "känslan av att våga lite mer", "värmen i rummet", "en blyg beröring",
        "närheten som växer", "ett försiktigt skratt", "lugn, djup andning"
      ],
      2: [
        "huden mot huden", "läppar som söker", "andhämtning som tätnar",
        "fingrar som stannar till", "värme som pulserar", "en darrning längs nacken",
        "tyg som ger efter", "en kyss som förlängs", "ord som viskas nära",
        "handflator som utforskar", "närmare, bara lite till", "tiden som saktar in",
        "värmen mellan er", "kroppar som hittar rytm", "små ljud som avslöjar allt"
      ],
      3: [
        "begär som tar fart", "ritmisk rörelse", "våt värme", "läppar och tunga",
        "händer som greppar", "höfter som möts", "en ström av värme",
        "tungt andetag mot huden", "korta, hungriga kyssar", "huden blir känslig",
        "ryck i andningen", "nära nog att darra", "kroppens självklara språk",
        "vill ha mer", "när allt faller på plats"
      ],
      4: [
        "våta kyssar", "handen mellan låren", "mun som utforskar",
        "sakta, sedan snabbare", "fingrar som glider in", "dovt stön nära örat",
        "höfter som pressar emot", "slickande, rytmiskt", "hon rider honom",
        "han tar ett stadigt tag om höften", "de vänder på sig", "djupare för varje rörelse",
        "kroppen svarar direkt", "allt hetare tempo", "oförställd njutning"
      ],
      5: [
        "våt slida", "hans lem glider in", "kåt och otålig",
        "hon sitter grensle och rider", "djupa stötar", "slickar långsamt och ivrigt",
        "hon särar benen mer", "jag vill ha dig nu", "han fyller henne helt",
        "fukt som rinner", "rytmen hårdnar", "stön som ekar", "kroppar som slår ihop",
        "han håller om hennes höfter", "hon rör sig snabbare",
        "hela hon pulserar", "hon skriker av njutning", "han kommer djupt",
        "våt värme omsluter honom", "efteråt ligger de andfådda"
      ]
    };

    // Bygg prompt-tillägg: hur många fraser som måste användas
    const { list, minUse, tone, taboos } = enrichSpec(LIB, L);

    const system = [
      "Du är en svensk berättarröst som skriver sensuella, vuxna noveller.",
      "Alltid samtycke mellan vuxna, inga minderåriga, ingen våldspornografi, inga övergrepp, inga djur, ingen incest.",
      "Skriv på naturlig modern svenska.",
      `Håll ungefär ${targetWords} ord (+/− 10%).`,
      `Ton: ${tone}.`,
      taboos
        ? `Undvik uttryck: ${taboos.join(", ")}.`
        : "",
      minUse > 0
        ? `Använd MINST ${minUse} uttryck från följande lista, väv in dem naturligt (böjning och plural får variera; maximera variation, upprepa inte samma fras): ${list.join("; ")}.`
        : `Du får använda 0–1 uttryck från listan (väldigt försiktigt): ${list.join("; ")}.`
    ].filter(Boolean).join("\n");

    const user = [
      `Idé: ${idea.trim()}`,
      `Nivå: ${L} (1=romantiskt antydande … 5=het, explicit men respektfull och samtyckt).`,
      "Skriv i tredje person, med tempo och upptrappning. Undvik klichéer och upprepningar.",
      "Beskriv kroppsliga förnimmelser och rytm, men håll det icke-grafiskt även på nivå 5 (inga anatomiska detaljer på medicinsk nivå).",
      "Avsluta på ett tillfredsställande sätt; inget 'fortsättning följer'."
    ].join("\n");

    // Kör Mistral först om nyckel finns, annars OpenAI (fallback)
    let text = null;
    if (env.MISTRAL_API_KEY) {
      text = await callMistral(env.MISTRAL_API_KEY, system, user);
    }
    if (!text && env.OPENAI_API_KEY) {
      text = await callOpenAI(env.OPENAI_API_KEY, system, user);
    }
    if (!text) {
      return json({ ok: false, error: "server_error", detail: "no_provider_response" }, 502);
    }

    // Extra säkerhetsrensning & lätt “enrichment” efter generering (valfritt)
    text = postClean(text);

    return json({ ok: true, text });
  } catch (err) {
    return json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500);
  }
}

/* ----------------- Helpers ----------------- */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8" }
  });
}

// Specificerar hur många fraser per nivå + ton + förbjudna uttryck för att hålla det icke-grafiskt
function enrichSpec(LIB, level) {
  const list = LIB[level] || [];
  let minUse = 0;
  let tone = "sensuellt, varmt, fokus på närhet och rytm";
  let taboos = [];

  switch (level) {
    case 1:
      minUse = 0; // tillåtet 0–1 (systemtext förklarar)
      tone = "romantiskt, antydande, mjukt och återhållsamt";
      break;
    case 2:
      minUse = 1;
      tone = "milt sensuellt, värme och närhet, låg explicithet";
      break;
    case 3:
      minUse = 2;
      tone = "tydligt sensuellt, upptrappning, mer kroppsliga detaljer utan att bli rå";
      break;
    case 4:
      minUse = 3;
      tone = "hett och energiskt, tydliga beskrivningar av handling och rytm, ändå respektfullt";
      // flytta “klitoris” till nivå 5 om vi råkar lägga in det i 4 framöver
      taboos = ["klitoris"];
      break;
    case 5:
      minUse = 5;
      tone = "mycket hett, direkt språk men respektfullt, samtyckt, inga kränkande epitet";
      break;
  }
  return { list, minUse, tone, taboos };
}

// En liten efter-städning så texten inte innehåller dubbla tomrader etc.
function postClean(s) {
  return String(s)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/* ----------- Providers ----------- */

async function callMistral(API_KEY, system, user) {
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.9,
        max_tokens: 1800
      })
    });
    if (!res.ok) throw new Error(`mistral_${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (_e) {
    return null;
  }
}

async function callOpenAI(API_KEY, system, user) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-mini", // kostnadseffektivt alternativ; byt om du vill
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.9,
        max_tokens: 1800
      })
    });
    if (!res.ok) throw new Error(`openai_${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (_e) {
    return null;
  }
}
