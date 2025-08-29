// functions/api/generate.js — GC v2.4 (Mistral för nivå 5, OpenAI för nivå 3, anti-klyscha)
import { corsHeaders, jsonResponse, badRequest, serverError } from "./_utils.js";

/* --- Enkel städning mot upprepningar/klyschor --- */
function sanitizeStory(s) {
  if (!s) return "";
  s = s.replace(/\s{2,}/g, " ").replace(/[•·]+/g, ".");
  const sentences = s.split(/(?<=[.!?])\s+/);
  const seen = new Set(), out = [];
  for (const sent of sentences) {
    const key = sent.toLowerCase().replace(/\W+/g, " ").trim().slice(0, 120);
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push(sent);
  }
  s = out.join(" ");

  // Ta bort några återkommande klyschor
  [ /doften av ceder/gi, /kanel och rök/gi, /elektricitet i luften/gi, /\bplötsligt\b/gi ].forEach(rx => { s = s.replace(rx, ""); });

  return s.replace(/\s+\./g, ".").replace(/\n{3,}/g, "\n\n").trim();
}

/* --- Prompter --- */
function systemFor(level) {
  if (level === 5) {
    return `
Du skriver på flytande SVENSKA. Stil: direkt, vuxet, passionerat, naturliga dialoger.
Undvik klyschor och upprepningar. Variera meningslängd. För handlingen framåt i varje stycke.
Avsluta alltid stycken med fullständiga meningar. Inga halvmeningar.
`;
  }
  // nivå 3
  return `
Du skriver på flytande SVENSKA. Stil: sensuell, varm, naturlig, inga klyschor, ingen upprepning.
Variera meningslängd och meningsstarter, använd konkreta sinnesdetaljer.
Avsluta alltid stycken med fullständiga meningar.
`;
}

function buildUserPrompt(idea, level, minutes) {
  const label = level === 5 ? "explicit" : "sensuell";
  const guide = `
Skriv en sammanhängande berättelse på svenska i jag-form eller nära tredje person.
Fokusera på närvaro, rörelse, blickar, beröring och dialog. Undvik “klyschfraser”.
Inga upprepningar. Variera tempo och intensitet mot en tydlig avrundning.
`;
  return [
    `Mål-längd: ~${minutes} min högläsning.`,
    `Nivå: ${label}.`,
    `Idé: ${idea || "egen idé; mjuk start, stegring, avrundning."}`,
    guide
  ].join("\n");
}

function withTimeout(ms = 45000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(new Error("timeout")), ms);
  return { signal: ac.signal, clear: () => clearTimeout(t) };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const { idea, level, minutes } = await request.json().catch(()=> ({}));
    const lvl = Number(level) || 3;
    const mins = Number(minutes) || 5;
    if (mins < 3 || mins > 15) return badRequest("ogiltig längd (3–15)", request);

    // ~400 tokens/min, men cap:a för att undvika timeouts
    const tokens = Math.min(1600, Math.max(600, Math.floor(mins * 400)));

    const sys = systemFor(lvl);
    const user = buildUserPrompt(idea, lvl, mins);

    const useMistral = (lvl === 5);
    const modelOA = "gpt-4o-mini";
    const modelMI = "mistral-large-latest";

    const oaParams = { model: modelOA, input: [ {role:"system",content:sys}, {role:"user",content:user} ], max_output_tokens: tokens, temperature: 0.65, top_p: 0.9 };
    const miParams = { model: modelMI, input: [ {role:"system",content:sys}, {role:"user",content:user} ], max_output_tokens: tokens, temperature: 0.7,  top_p: 0.9 };

    const { signal, clear } = withTimeout(45000);
    let rawText = "", provider = "";

    async function callOpenAI() {
      provider = "openai";
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(oaParams),
        signal
      });
      if (!r.ok) throw new Error(`openai_${r.status}`);
      const j = await r.json();
      return j?.output?.[0]?.content?.[0]?.text || "";
    }

    async function callMistral() {
      provider = "mistral";
      const r = await fetch("https://api.mistral.ai/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.MISTRAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(miParams),
        signal
      });
      if (!r.ok) throw new Error(`mistral_${r.status}`);
      const j = await r.json();
      return j?.output?.[0]?.content?.[0]?.text || "";
    }

    try {
      rawText = useMistral ? await callMistral() : await callOpenAI();
    } catch (e) {
      try {
        rawText = useMistral ? await callOpenAI() : await callMistral();
        provider += "(fallback)";
      } catch (e2) {
        clear(); return serverError(e2?.message || "LM fel", request);
      }
    }
    clear();

    const story = sanitizeStory(rawText);
    return jsonResponse({ ok: true, provider, model: useMistral ? modelMI : modelOA, story }, 200, request);
  } catch (err) {
    return serverError(err, request);
  }
}
