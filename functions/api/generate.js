// functions/api/generate.js — GC v2.3 (Mistral ⇄ OpenAI, anti-klyscha, anti-upprepning)
import { corsHeaders, jsonResponse, badRequest, serverError } from "./_utils.js";

/* ---------- Sanering mot upprepningar/klyschor ---------- */
function sanitizeStory(s) {
  if (!s) return "";
  // städa whitespace och kulor
  s = s.replace(/\s{2,}/g, ' ').replace(/[•·]+/g, '.');

  // ta bort upprepade meningar (enkel fuzzy-nyckel)
  const sentences = s.split(/(?<=[.!?])\s+/);
  const seen = new Set();
  const filtered = [];
  for (const sent of sentences) {
    const key = sent.toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 120);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push(sent);
  }
  s = filtered.join(' ');

  // ersätt bort klyschor
  const ban = [
    /doften av ceder/gi,
    /kanel och rök/gi,
    /elektricitet i luften/gi,
    /över [a-zåäö]+ kroppen/gi,
    /\bplötsligt\b/gi
  ];
  ban.forEach(rx => { s = s.replace(rx, ''); });

  return s.replace(/\s+\./g, '.').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- Promptbyggare ---------- */
function buildUserPrompt(idea, level, minutes) {
  const guide = `
Skriv en sammanhängande berättelse på svenska i jag-form eller nära tredje person.
Stil: sensuell, varm, konkret, inga klyschor, *inga* upprepningar. För handlingen framåt i varje stycke.
Variera meningslängd, använd sinnesdetaljer (ljud, rörelse, beröring) hellre än abstrakta ord.
Avsluta alltid stycket med en fullständig mening (ingen halv mening).
`;

  return [
    `Mål-längd: ~${minutes} min högläsning.`,
    `Nivå: ${level === 5 ? "explicit" : "sensuell"}.`,
    `Idé: ${idea || "egen idé; sensuell scen med mjuk start, stegring, avrundning."}`,
    guide
  ].join("\n");
}

const SYSTEM_SV = `
Du skriver på KLANDERFRI SVENSKA.
Stil: sensuell, varm, naturlig dialog, inga klyschor, ingen upprepning.
Undvik uttryck: "doften av ceder", "kanel och rök", "elektricitet i luften", "över hela kroppen", "plötsligt".
Variera meningsstarter, blanda korta och längre meningar, för handlingen framåt varje stycke.
Använd konkreta sinnesdetaljer (ljud, rörelse, beröring). Avsluta alltid en scen med en full mening.
`;

/* ---------- Timeout helper ---------- */
function withTimeout(ms = 45000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("timeout")), ms);
  return { signal: ac.signal, clear: () => clearTimeout(t) };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const { idea, level, minutes } = await request.json().catch(() => ({}));
    const lvl = Number(level) || 3;
    const mins = Number(minutes) || 5;
    if (mins < 3 || mins > 15) return badRequest("ogiltig längd (3–15)", request);

    // tokens ~400/min är bra för modern LLM utan att timea ut
    const tokensPerPart = Math.min(1600, Math.max(600, Math.floor(mins * 400)));

    const userPrompt = buildUserPrompt(idea, lvl, mins);

    const useMistral = (lvl === 5); // 5 => Mistral, 3 => OpenAI
    const modelOpenAI  = "gpt-4o-mini";
    const modelMistral = "mistral-large-latest";

    const oaParams = {
      model: modelOpenAI,
      input: [
        { role: "system", content: SYSTEM_SV },
        { role: "user",   content: userPrompt }
      ],
      max_output_tokens: tokensPerPart,
      temperature: 0.6,
      top_p: 0.9
    };

    const miParams = {
      model: modelMistral,
      input: [
        { role: "system", content: SYSTEM_SV },
        { role: "user",   content: userPrompt }
      ],
      max_output_tokens: tokensPerPart,
      temperature: 0.65,
      top_p: 0.9
    };

    const { signal, clear } = withTimeout(45000);
    let rawText = "";
    let provider = "";

    async function callOpenAI() {
      provider = "openai";
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(oaParams),
        signal
      });
      if (!r.ok) throw new Error(`openai_${r.status}`);
      const data = await r.json();
      return data?.output?.[0]?.content?.[0]?.text || "";
    }

    async function callMistral() {
      provider = "mistral";
      const r = await fetch("https://api.mistral.ai/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(miParams),
        signal
      });
      if (!r.ok) throw new Error(`mistral_${r.status}`);
      const data = await r.json();
      return data?.output?.[0]?.content?.[0]?.text || "";
    }

    try {
      rawText = useMistral ? await callMistral() : await callOpenAI();
    } catch (e) {
      // Fallback mellan providers vid 429/500/timeout
      try {
        rawText = useMistral ? await callOpenAI() : await callMistral();
        provider += "(fallback)";
      } catch (e2) {
        clear();
        return serverError(e2?.message || "LM fel", request);
      }
    }
    clear();

    const story = sanitizeStory(rawText);

    return jsonResponse(
      { ok: true, provider, model: useMistral ? modelMistral : modelOpenAI, story },
      200,
      request
    );
  } catch (err) {
    return serverError(err, request);
  }
}
