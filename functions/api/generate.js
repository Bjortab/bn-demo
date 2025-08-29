// functions/api/generate-part.js
// GC v3 — Chunkad generering för att undvika Cloudflare timeouts
// - Genererar en del (chunk) i taget (<~20–25s)
// - Mistral→OpenAI fallback per del
// - Fronten loopar: partIndex=1..totalParts

import { jsonResponse, corsHeaders, badRequest, serverError } from "./_utils.js";

const OPENAI_URL   = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";
const MISTRAL_URL  = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_MODEL= "mistral-large-latest";

const WPM = 230;
const TOKENS_PER_WORD = 1.35;

// sikta på korta körningar per del
const MAX_TOKENS_PER_PART = 600;         // ~ 450 ord ≈ 2 min uppläst
const PER_FETCH_TIMEOUT_MS = 20000;      // < 20s per anrop
const TEMPERATURE = 0.9;

function wordsTarget(minutes){ return Math.max(60, Math.floor(minutes * WPM)); }
function tokensTarget(minutes){ return Math.floor(wordsTarget(minutes) * TOKENS_PER_WORD); }
function totalPartsFor(minutes){
  const totalToks = tokensTarget(minutes);
  return Math.max(1, Math.ceil(totalToks / MAX_TOKENS_PER_PART));
}

function levelTone(level){
  if (level >= 5) return "mycket explicit vuxen ton på idiomatisk svenska";
  if (level >= 4) return "het, kroppsnära vuxen ton på idiomatisk svenska";
  return "sensuell, naturlig svenska utan grafiska detaljer";
}

function buildSystemPrompt(level, totalParts) {
  return [
    `Du är en svensk berättarröst.`,
    `Skriv idiomatisk, naturlig svenska, undvik klichéer och felaktiga kroppsbeskrivningar.`,
    `Håll röd tråd, konsekvent tempus och realistiskt flyt.`,
    `Delad generering: Berättelsen skapas i ${totalParts} delar.`
  ].join(" ");
}

function buildUserPrompt({ idea, level, minutes, partIndex, totalParts, prevTail }) {
  const tone = levelTone(level);
  const lead = partIndex === 1
    ? `Detta är DEL ${partIndex} av ${totalParts}. Börja berättelsen naturligt utifrån idén.`
    : `Detta är DEL ${partIndex} av ${totalParts}. Fortsätt sömlöst från föregående del.`;

  const continuity = prevTail
    ? `Fortsätt direkt efter detta utdrag (upprepa inte texten, fortsätt logiskt):\n"""${prevTail.slice(-600)}"""`
    : ``;

  const closeHint = partIndex === totalParts
    ? `Avsluta berättelsen med en tydlig avrundning – inte abrupt.`
    : `Avsluta DEL ${partIndex} med en mjuk “hängbräda” som leder vidare, inte ett hårt slut.`;

  return [
    lead,
    `Ton: ${tone}.`,
    `Längdmål totalt: ca ${minutes} minuter.`,
    continuity,
    `Använd repliker sparsamt för rytm. Undvik upprepningar.`,
    closeHint,
    `Idé/tema att utgå från:\n"""${idea}"""`
  ].filter(Boolean).join("\n\n");
}

function withTimeout(ms){
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("timeout")), ms);
  return { signal: ac.signal, clear: () => clearTimeout(t) };
}

async function callMistral(env, messages, max_tokens){
  if (!env.MISTRAL_API_KEY) throw new Error("saknar_MISTRAL_API_KEY");
  const { signal, clear } = withTimeout(PER_FETCH_TIMEOUT_MS);
  try{
    const res = await fetch(MISTRAL_URL, {
      method: "POST",
      signal,
      headers: {
        "Authorization": `Bearer ${env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages,
        temperature: TEMPERATURE,
        max_tokens
      })
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`mistral_${res.status}: ${raw}`);
    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content || "";
    return text;
  } finally { clear(); }
}

async function callOpenAI(env, messages, max_tokens){
  if (!env.OPENAI_API_KEY) throw new Error("saknar_OPENAI_API_KEY");
  const { signal, clear } = withTimeout(PER_FETCH_TIMEOUT_MS);
  try{
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      signal,
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: TEMPERATURE,
        max_tokens
      })
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`openai_${res.status}: ${raw}`);
    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content || "";
    return text;
  } finally { clear(); }
}

function softClean(s){
  if (!s) return "";
  let t = s.replace(/\n{3,}/g, "\n\n").trim();
  if (!/[.!?…]$/.test(t.slice(-1))) t += "…";
  return t;
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return badRequest("Use POST", request);

  try {
    const body = await request.json().catch(()=> ({}));
    const idea = String(body?.idea || "").trim();
    const level = Number(body?.level ?? 3);
    const minutes = Math.max(1, Math.min(30, Number(body?.minutes ?? 5)));
    const partIndex = Math.max(1, Number(body?.partIndex ?? 1));
    let totalParts  = Number(body?.totalParts || 0);
    const prevTail  = String(body?.prevTail || "");

    if (!idea) return badRequest("saknar idé", request);
    if (!totalParts) totalParts = totalPartsFor(minutes);

    const sys = buildSystemPrompt(level, totalParts);
    const usr = buildUserPrompt({ idea, level, minutes, partIndex, totalParts, prevTail });
    const messages = [
      { role: "system", content: sys },
      { role: "user",   content: usr }
    ];

    // Starta med Mistral för nivå 4–5, annars OpenAI
    const primary = level >= 4 ? "mistral" : "openai";

    let chunk = "";
    try{
      chunk = primary === "mistral"
        ? await callMistral(env, messages, MAX_TOKENS_PER_PART)
        : await callOpenAI(env, messages, MAX_TOKENS_PER_PART);
    } catch (e) {
      // fallback
      chunk = primary === "mistral"
        ? await callOpenAI(env, messages, MAX_TOKENS_PER_PART)
        : await callMistral(env, messages, MAX_TOKENS_PER_PART);
    }

    chunk = softClean(chunk);
    const done = partIndex >= totalParts;
    // skicka tillbaka sista 600 tecken som “svans” för nästa del
    const tail = chunk.slice(-600);

    return jsonResponse({
      ok: true,
      partIndex,
      totalParts,
      done,
      chunk,
      nextTail: tail
    }, 200, request);

  } catch (err) {
    return serverError(err, request);
  }
}
