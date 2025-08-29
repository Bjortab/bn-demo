// functions/api/generate.js — GC v2.5 (L5 = Mistral + lexikon, L3 = OpenAI)
import { corsHeaders, jsonResponse, badRequest, serverError } from "./_utils.js";

/* ---------- Anti-klyscha / städning ---------- */
function sanitizeStory(s) {
  if (!s) return "";
  s = s.replace(/\s{2,}/g, " ").replace(/[•·]+/g, ".");
  const sentences = s.split(/(?<=[.!?])\s+/);
  const seen = new Set(), out = [];
  for (const sent of sentences) {
    const key = sent.toLowerCase().replace(/\W+/g, " ").trim().slice(0, 140);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(sent);
  }
  // Ta bort typiska klyschor vi sett återkomma
  [
    /doften av ceder/gi,
    /kanel och rök/gi,
    /elektricitet i luften/gi,
    /\bplötsligt\b/gi,
  ].forEach(rx => { s = s.replace(rx, ""); });

  return out.join(" ").replace(/\s+\./g, ".").trim();
}

/* ---------- Lexikonladdning (robust) ---------- */
async function loadLexicon(request) {
  const base = new URL(request.url).origin;
  const candidates = ["/lexicon.json", "/sv-lexicon.json", "/sv-lexicon.js"]; // sista är fallback (returns JSON)
  for (const path of candidates) {
    try {
      const r = await fetch(base + path, { cf: { cacheTtl: 60 } });
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("application/json") || ct.includes("text/json")) {
        return await r.json();
      }
      // Om det är .js som exporterar JSON som text, försök parsa
      const txt = await r.text();
      try { return JSON.parse(txt); } catch {}
    } catch {}
  }
  return null;
}

function pickSome(arr, n) {
  if (!Array.isArray(arr) || !arr.length) return [];
  const out = [];
  const pool = [...arr];
  while (out.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i,1)[0]);
  }
  return out;
}

/* ---------- Prompter ---------- */
function systemFor(level) {
  if (level === 5) {
    // Mer rak, vuxen ton. Undviker klyschor & upprepningar. Fullständiga meningar.
    return `
Du skriver på flytande SVENSKA. Ton: vuxen, passionerad, konkret och direkt.
Använd naturliga dialoger. Undvik klyschor, standardspråk och upprepningar.
Variera meningslängd och rytm. För handlingen framåt varje stycke.
Avrunda berättelsen tydligt – inga avklippta meningar.
`;
  }
  // L3 – sensuell och varm, men inte explicit
  return `
Du skriver på flytande SVENSKA. Ton: sensuell, varm, närvarande – utan grovt språk.
Variera meningslängd, undvik upprepningar och klyschor. Avrunda berättelsen tydligt.
`;
}

function buildUserPrompt(idea, level, minutes, lex) {
  const label = level === 5 ? "explicit" : "sensuell";
  const guideCommon = `
Skriv en sammanhängande berättelse på svenska i jag-form eller nära tredje person.
Fokusera på närvaro, blickar, beröring, rörelse och dialog. Undvik "klyschfraser".
Variera tempo och intensitet mot en tydlig avrundning.
`;

  // För nivå 5: injicera valda lexikonfraser för variation i språk och ton
  let lexNote = "";
  if (level === 5 && lex && lex.level5) {
    const buckets = [
      ...(lex.level5.actions || []),
      ...(lex.level5.sensations || []),
      ...(lex.level5.dialogue || []),
      ...(lex.level5.verbs || []),
      ...(lex.level5.nouns || []),
      ...(lex.level5.phrases || []),
    ];
    const picks = pickSome(buckets, 6);
    if (picks.length) {
      lexNote = `\nAnvänd naturligt (spritt och varsamt) några av dessa uttryck i berättelsen där de passar: ${picks.join(" • ")}\n`;
    }
  }

  return [
    `Mål-längd: ~${minutes} min högläsning.`,
    `Nivå: ${label}.`,
    `Idé: ${idea || "egen idé; mjuk start, stegring, avrundning."}`,
    guideCommon.trim(),
    lexNote.trim()
  ].filter(Boolean).join("\n");
}

function withTimeout(ms = 45000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("timeout")), ms);
  return { signal: ac.signal, clear: () => clearTimeout(t) };
}

/* ---------- Handlers ---------- */
export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(()=> ({}));
    const idea = (body?.idea || "").toString().trim();
    const lvl  = Number(body?.level) || 3;
    const mins = Number(body?.minutes) || 5;
    if (mins < 3 || mins > 15) return badRequest("ogiltig längd (3–15)", request);

    // Tokenbudget (~400 tok/min) men kapa för att undvika timeouts
    const maxTokens = Math.min(1600, Math.max(700, Math.floor(mins * 400)));

    // Ladda ev. lexikon (för nivå 5)
    let lex = null;
    if (lvl === 5) {
      lex = await loadLexicon(request).catch(()=> null);
    }

    const sys  = systemFor(lvl);
    const user = buildUserPrompt(idea, lvl, mins, lex);

    const useMistralFirst = (lvl === 5);
    const modelOpenAI = "gpt-4o-mini";
    const modelMistral = "mistral-large-latest";

    const oaParams = {
      model: modelOpenAI,
      input: [{ role: "system", content: sys }, { role: "user", content: user }],
      max_output_tokens: maxTokens,
      temperature: 0.6,
      top_p: 0.9
    };

    const miParams = {
      model: modelMistral,
      input: [{ role: "system", content: sys }, { role: "user", content: user }],
      max_output_tokens: maxTokens,
      temperature: 0.8,   // lite friare för nivå 5
      top_p: 0.92
    };

    async function callOpenAI(signal) {
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
      const j = await r.json();
      return j?.output?.[0]?.content?.[0]?.text || "";
    }

    async function callMistral(signal) {
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
      const j = await r.json();
      return j?.output?.[0]?.content?.[0]?.text || "";
    }

    const { signal, clear } = withTimeout(45000);
    let provider = "", raw = "";

    try {
      if (useMistralFirst) {
        provider = "mistral";
        raw = await callMistral(signal);
      } else {
        provider = "openai";
        raw = await callOpenAI(signal);
      }
    } catch (firstErr) {
      // Fallback
      try {
        if (useMistralFirst) {
          provider = "openai(fallback)";
          raw = await callOpenAI(signal);
        } else {
          provider = "mistral(fallback)";
          raw = await callMistral(signal);
        }
      } catch (secondErr) {
        clear();
        return serverError(secondErr?.message || "LM fel", request);
      }
    }
    clear();

    const story = sanitizeStory(raw);
    return jsonResponse({ ok: true, provider, model: (provider.startsWith("mistral") ? modelMistral : modelOpenAI), story }, 200, request);
  } catch (err) {
    return serverError(err, request);
  }
}
