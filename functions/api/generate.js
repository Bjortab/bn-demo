import { jsonResponse, corsHeaders, badRequest, serverError, readJson, openAIHeaders } from "./_utils.js";

function tokensTarget(minutes = 5) {
  const m = Math.max(5, Math.min(15, Number(minutes)||5));
  const chars = 1500 + (m - 5) * 950; // skalning utan loop-känsla
  return Math.round(chars / 4); // ~tokens
}

function levelBrief(level){
  const L = Number(level)||3;
  if (L >= 5) {
    return `
NIVÅ 5 – explicit:
- Tillåtet: direkt erotiskt språk, tydliga handlingar och kroppsliga beskrivningar.
- Viktigt: naturlig svensk frasering, inga staplade könsord, väv in uttrycken i meningen.
- Målet är upphetsning och närvaro, inte grov chock.
- Inga minderåriga, inget tvång, inga olagligheter. Alltid samtycke.`;
  }
  if (L >= 4) {
    return `
NIVÅ 4 – het men icke-vulgär:
- Använd anatomiskt korrekta ord och uttryck (t.ex. "lem", "vagina", "trängde in", "våt", "upphetsad", "kunde inte hålla tillbaka", "när han kom").
- Undvik grova slang/könsord; håll stilen sensuell men tydlig.
- Fokusera på rytm, andning, beröring, känslolägen och tydlig, het handling utan vulgaritet.`;
  }
  return `
NIVÅ 3 – sensuell:
- Mjuk, romantisk, antydande. Undvik explicit språk.
- Fokusera på stämning, dofter, hud, blickar, långsam stegring.`;
}

function systemRules(level){
  return `
Du skriver erotiska berättelser på svenska.
- Undvik svengelska och direktöversatta fraser.
- Variera verb/synonymer för att undvika upprepning.
- Bygg tydlig dramaturgi: inledande närhet → stegring → klimax → efterklang.
- Använd korta och medellånga meningar blandat. Variera rytm.
- Markera tal-pauser diskret med taggar [p:kort] och [p:lång] där en mänsklig uppläsare naturligt skulle dra ut på rösten.
${levelBrief(level)}
- Avsluta naturligt (ingen "sammanfattning i slutet").`;
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST")   return badRequest(request, "Use POST");

  try {
    const body = await readJson(request) || {};
    const idea    = String(body.idea || "").slice(0, 1500);
    const level   = Number(body.level || 3);
    const minutes = Number(body.minutes || 5);

    const headers = openAIHeaders(env);
    if (!headers) return serverError(request, "OPENAI_API_KEY saknas");

    const system = systemRules(level);
    const user = [
      `Mål-längd: ${minutes} minuter (utan att upprepa innehåll).`,
      idea ? `Utgå från idén: """${idea}"""` : `Skriv en fristående scen.`,
      `Skriv sammanhängande prosa med stycken. Ingen punktlista.`,
      `Lägg diskreta pausmarkörer [p:kort] / [p:lång] där uppläsningen mår bra av andning/pauser.`,
      `Skriv endast berättelsen (ingen meta-text).`
    ].join("\n");

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: system },
          { role: "user",   content: user }
        ],
        max_output_tokens: tokensTarget(minutes),
        temperature: level >= 5 ? 0.95 : (level >=4 ? 0.9 : 0.85),
        presence_penalty: 0.7,
        frequency_penalty: 0.7
      })
    });

    const txt = await res.text().catch(()=> "");
    if (!res.ok) {
      let detail = txt;
      try { detail = JSON.parse(txt); } catch {}
      return jsonResponse({ ok:false, error:"LLM error", detail, status:res.status }, res.status, corsHeaders(request));
    }

    let data;
    try { data = JSON.parse(txt); }
    catch { return serverError(request, "Ogiltig JSON från LLM"); }

    // Plocka text robust (Responses API)
    let story = "";
    try {
      if (typeof data.output_text === "string" && data.output_text.trim()) {
        story = data.output_text.trim();
      } else if (Array.isArray(data.output)) {
        const parts = [];
        for (const block of data.output) {
          for (const c of (block.content || [])) {
            if ((c.type === "output_text" || c.type === "text") && typeof c.text === "string") parts.push(c.text);
          }
        }
        story = parts.join("\n").trim();
      }
    } catch {}
    if (!story) return jsonResponse({ ok:false, error:"EMPTY_STORY" }, 200, corsHeaders(request));

    // Skicka tillbaka som är – appen visar ren text; TTS parser använder pausmarkörer.
    return jsonResponse({ ok:true, story }, 200, corsHeaders(request));
  } catch (e) {
    return serverError(request, e);
  }
}
