// functions/api/generate.js
// Genererar svensk text. 1–3 OpenAI (snällare), 4–5 Mistral (friare).
// Skalar längd på minuter och förstärker skillnaden mellan nivåerna.

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  try {
    const body = await request.json().catch(() => ({}));
    const idea = String(body?.idea || "").trim();
    const spice = clamp(Number(body?.spice || 2), 1, 5);
    const minutes = clamp(Number(body?.minutes || 5), 1, 15);

    if (!idea) return j({ error: "empty_idea" }, 400);

    // Ca 170 ord/min
    const targetWords = Math.round(minutes * 170);

    // ——— Gemensam säkerhet/ram ———
    const guard = `
Alla deltagare är vuxna (18+) och samtyckande.
Inga minderåriga, tvång, droger, övergrepp, hat eller diskriminering.
Undvik verkliga identiteter och privat information.
Skriv på idiomatisk svenska, uppläsningsvänligt, variera rytm och undvik upprepningar.
Mål: ca ${targetWords} ord (±15%).
`;

    // ——— Lexikon ———
    const explicitLex = [
      "lem","kuk","slida","sköte","våt","slicka","tunga",
      "trängde","penetrerade","rida","stötar","pulserande","glidande",
      "samlag","orgasm","kom"
    ];
    const explicitList = explicitLex.join(", ");

    // ——— Ton per nivå ———
    const lvl1 = `
TON: romantisk, antydande. Fokus på blickar, dofter, fjärilar i magen, värme.
FÖRBJUDET språk: ${explicitList}.
Tillåt kyssar och subtil beröring över kläder – inga tekniska detaljer.
Avsluta diskret utan klyschor.
`;

    const lvl3 = `
TON: sensuell och tydlig kroppslighet men utan explicit vokabulär.
FÖRBJUDET språk: ${explicitList}.
Tillåt händer under kläder, läppar mot hud, andning, stön; håll det elegant.
Ingen mekanik (inga "trängde/penetrerade/rida" etc.).
`;

    const lvl5 = `
TON: het och direkt men respektfull. Vuxet språk tillåtet.
KRAV: Väva in flera ord ur listan där det passar naturligt: ${explicitList}.
Beskriv rörelser, rytm och stegring i vågor (tempo, tryck, djup).
Undvik klichéer och omskrivningar i payoffen. Ingen "kyss och fade" på slutet.
`;

    const system = `
Du är en svensk författare av sensuella ljudnoveller.
Skriv i presens eller preteritum konsekvent, korta meningar med varierad längd.
Ingen uppräkning i listform, inga cookie-cutter fraser.
${guard}
${spice <= 1 ? lvl1 : spice <= 3 ? lvl3 : lvl5}
`;

    const user = `
Idé från användare: "${idea}"
Sätt scenen snabbt (1–2 meningar), bygg stegring, leverera payoff, och runda av utan moralkakor.
`;

    const useMistral = spice >= 4 && !!env.MISTRAL_API_KEY;

    let story = "";
    if (useMistral) {
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "mistral-large-latest",
          temperature: 0.95,
          max_tokens: 1500,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });
      if (!r.ok) return j({ error: "mistral_failed", status: r.status, details: await safe(r) }, 502);
      const data = await r.json();
      story = (data?.choices?.[0]?.message?.content || "").trim();
    } else {
      if (!env.OPENAI_API_KEY) return j({ error: "missing_openai_key" }, 500);
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: spice <= 1 ? 0.55 : 0.7,
          max_tokens: 1200,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });
      if (!r.ok) return j({ error: "openai_failed", status: r.status, details: await safe(r) }, 502);
      const data = await r.json();
      story = (data?.choices?.[0]?.message?.content || "").trim();
    }

    if (!story) return j({ error: "empty_story" }, 502);

    // Städning + små förstärkningar
    story = tidy(story);
    if (spice >= 4) {
      // säkerställ att minst några explicit-ord finns
      const lc = story.toLowerCase();
      const hits = explicitLex.filter(w => lc.includes(w));
      if (hits.length < 3) {
        story += `\n\nHettan steg; ${explicitLex.slice(0,5).join(", ")} vävdes in i rytmen deras kroppar delade.`;
      }
    }
    const excerpt = excerptOf(story, 280);
    return j({ story, excerpt });
  } catch (e) {
    return j({ error: "generate_crash", message: String(e) }, 500);
  }
}

function j(o, s=200){return new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json; charset=utf-8'}});}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function tidy(t){return String(t).replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').replace(/[ \t]{2,}/g,' ').trim();}
function excerptOf(t,max){return t.length<=max?t:t.slice(0,max).replace(/\s+\S*$/,'')+'…';}
async function safe(r){try{return await r.json();}catch{try{return await r.text();}catch{return'';}}}
