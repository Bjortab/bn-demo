// functions/api/generate.js — GC v2.3.1
// OpenAI primär (1–5), Mistral fallback. Auto-continue i chunkar.
// Svensk efter-polering via sv-lexicon.js (anti-kliché + småfix + anti-upprepning).

import { jsonResponse, badRequest, serverError, corsHeaders } from "./_utils.js";
import { LEX } from "./sv-lexicon.js";

const OAI_URL     = "https://api.openai.com/v1/responses";
const OAI_MODEL   = "gpt-4o-mini";

const MISTRAL_URL   = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_MODEL = "mistral-large-latest";

// Längder & chunkning
const TOKENS_PER_MIN   = 170;
const CHUNK_MAX_TOKENS = 1200;
const TOTAL_MAX_TOKENS = 3600;
const MAX_CHUNKS       = 4;

function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function endsNicely(s){ return /[.!?…]\s*$/.test(String(s||"").trim()); }

// ——— Polish & lexikon ———
function applyLexicon(text){
  if (!text) return text;
  let t = String(text);

  // Klichéer
  for (const {re, repl} of (LEX.banPhrases||[])) t = t.replace(re, repl);

  // Grammatik/ordval
  for (const {re, repl} of (LEX.grammarFixes||[])) t = t.replace(re, repl);

  // Extra: ersätt “kanel och rök” generellt om den smugit in på annat sätt
  t = t.replace(/kanel\s+och\s+r(ö|o)k/gi, () => {
    const alts = LEX.perfumeAlternatives||[];
    return alts.length ? alts[ Math.floor(Math.random()*alts.length) ] : "toner av vanilj och mysk";
  });

  // Anti-upprepningar (identiska meningar)
  if (LEX.dedupeSentences) t = dedupeSentences(t);

  // Enkel 2–3-ords eko
  if (LEX.dedupeShortEcho){
    t = t.replace(/\b(\w+\s+\w+)\s+\1\b/gi, "$1");
    t = t.replace(/\b(\w+\s+\w+\s+\w+)\s+\1\b/gi, "$1");
  }

  // Normalisera whitespace
  t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

function dedupeSentences(text){
  const parts = text.split(/([.!?…]\s+)/); // behåll skiljetecken
  const seen = new Set();
  let out = "";
  for (let i=0; i<parts.length; i+=2){
    const sent = (parts[i]||"").trim();
    const sep  = parts[i+1] || "";
    if (!sent){ out += sep; continue; }
    const key = sent.toLowerCase();
    if (seen.has(key)) { continue; }
    seen.add(key);
    out += sent + sep;
  }
  return out;
}

// ——— Nivåtoner ———
function levelStyle(level){
  const base = [
    "Skriv på idiomatisk svenska med naturlig rytm och varierad meningslängd.",
    "Undvik upprepningar, klichéer och direktöversatta engelska uttryck.",
    "Allt sker mellan vuxna och med ömsesidigt samtycke. Inget olagligt.",
    "Berättarteknik: start → stegring → klimax → avrundning.",
    "Variera sensorik utan klichéer; dofter ska kännas trovärdiga (undvik 'kanel och rök')."
  ];

  if (level <= 3){
    base.push(
      "Nivå 1–3: romantisk och sensuell ton. Fokus på känslor, blickar och beröring. Undvik råa ord."
    );
  } else if (level === 4){
    base.push(
      "Nivå 4: het, vuxen ton. Svenska vuxna ord kan förekomma: lem, vagina, våt, hård, pulserande, trängde in, rytm, klimax.",
      "Håll språket stilfullt och sammanhängande. Ingen mekanisk uppräkning."
    );
  } else {
    base.push(
      "Nivå 5: intensiv, direkt vuxen ton. Våga vara tydlig när scenen kräver det, men håll språket idiomatiskt och varierat.",
      "Undvik att stapla råa ord; låt handling och känsla bära texten. Inga upprepningar."
    );
  }

  return base.join(" ");
}

function buildUser(idea, level, minutes){
  const goal = clamp(Math.round((minutes||5) * TOKENS_PER_MIN), 400, TOTAL_MAX_TOKENS);
  const ideaLine = (idea && idea.trim())
    ? `Idé från användaren: ${idea.trim()}`
    : "Ingen specifik idé — skapa trovärdig svensk miljö och karaktärer.";
  return [
    `Mållängd totalt: ca ${goal} tokens.`,
    ideaLine,
    "Integrera idén organiskt. Avrunda tydligt. Undvik identiska fraser.",
    "Undvik parfymklichéer; om doft nämns, variera trovärdigt (t.ex. mysk, vanilj, ceder, citrus)."
  ].join(" ");
}

function withTimeout(ms){
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort(new Error("timeout")), ms);
  return { signal: ac.signal, cancel: ()=>clearTimeout(t) };
}

// ——— Klienter ———
async function callOpenAI(env, messages, maxTokens, timeoutMs){
  if (!env.OPENAI_API_KEY) throw new Error("saknar_OPENAI_API_KEY");
  const { signal, cancel } = withTimeout(timeoutMs);
  try{
    const r = await fetch(OAI_URL, {
      method:"POST",
      signal,
      headers:{
        "authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: OAI_MODEL,
        input: messages,
        max_output_tokens: maxTokens,
        temperature: 0.92,
        presence_penalty: 0.35,
        frequency_penalty: 0.3
      })
    });
    const raw = await r.text();
    if (!r.ok) throw new Error(`openai_${r.status}: ${raw.slice(0,500)}`);
    const data = JSON.parse(raw);
    const out0 = data?.output?.[0];
    let text = "";
    if (out0?.content?.[0]?.type === "output_text") text = out0.content[0].text || "";
    else if (out0?.content?.[0]?.text)            text = out0.content[0].text || "";
    else                                          text = data?.output_text || "";
    return (text||"").trim();
  } finally { cancel(); }
}

async function callMistral(env, messages, maxTokens, timeoutMs){
  if (!env.MISTRAL_API_KEY) throw new Error("saknar_MISTRAL_API_KEY");
  const { signal, cancel } = withTimeout(timeoutMs);
  try{
    const r = await fetch(MISTRAL_URL, {
      method:"POST",
      signal,
      headers:{
        "authorization": `Bearer ${env.MISTRAL_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature: 0.95,
        presence_penalty: 0.35,
        frequency_penalty: 0.3
      })
    });
    const raw = await r.text();
    if (!r.ok) throw new Error(`mistral_${r.status}: ${raw.slice(0,500)}`);
    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content || "";
    return (text||"").trim();
  } finally { cancel(); }
}

// Försök OpenAI → fallback Mistral
async function callLLM(env, messages, maxTokens, timeoutMs){
  try{
    return await callOpenAI(env, messages, maxTokens, timeoutMs);
  }catch(e1){
    if (env.MISTRAL_API_KEY) {
      try{ return await callMistral(env, messages, maxTokens, timeoutMs); }
      catch(e2){ throw new Error(String(e1?.message||e1) + " | " + String(e2?.message||e2)); }
    }
    throw e1;
  }
}

// ——— Handler ———
export async function onRequestPost(context){
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return badRequest("Use POST", request);
  }

  try{
    const b = await request.json().catch(()=>({}));
    const idea    = String(b?.idea||"");
    const level   = clamp(Number(b?.level||3), 1, 5);
    const minutes = clamp(Number(b?.minutes||5), 1, 15);

    const sys = levelStyle(level);
    const usr = buildUser(idea, level, minutes);

    const targetTokens = clamp(Math.round(minutes * TOKENS_PER_MIN), 400, TOTAL_MAX_TOKENS);

    // Grundprompt
    const base = [
      { role:"system", content: sys },
      { role:"user",   content: usr }
    ];

    let story = "";
    let used  = 0;

    for (let i=0; i<MAX_CHUNKS; i++){
      const remaining = clamp(targetTokens - used, Math.min(CHUNK_MAX_TOKENS, targetTokens), CHUNK_MAX_TOKENS);
      const timeoutMs = clamp(18_000 + minutes*6_000, 24_000, 90_000);

      const messages = (i===0)
        ? base
        : [
            { role:"system", content: sys },
            { role:"user",   content: usr },
            { role:"assistant", content: story.slice(-4000) },
            { role:"user",   content: "Fortsätt exakt där du slutade, sömlöst. Avsluta med en tydlig avrundning." }
          ];

      const chunk = await callLLM(env, messages, remaining, timeoutMs);
      if (!chunk) break;

      story += (story ? "\n\n" : "") + chunk;
      used  += Math.min(remaining, CHUNK_MAX_TOKENS);

      const longEnough = story.length > Math.round(targetTokens * 0.6);
      if (longEnough && endsNicely(story)) break;
    }

    story = applyLexicon((story||"").trim());
    if (!story) return jsonResponse({ ok:false, error:"tomt svar" }, 502, request);
    if (!endsNicely(story)) story += " … Till sist föll allt till ro, och vi vilade i varandras närhet.";

    return jsonResponse({ ok:true, text:story }, 200, request);

  }catch(err){
    return serverError(err, request);
  }
}

export async function onRequestOptions(context){
  return new Response(null, { headers: corsHeaders(context.request) });
}
