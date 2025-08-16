// Cloudflare Pages Function: /api/generate
// 🔥 Robust textgenerator med fallback: OpenAI → Mistral.
// – Validerar input
// – Timeout + tydliga fel
// – CORS OK
// – "Snusk-nivå" styr ton (1–5), alltid vuxet, samtycke och icke-grafiskt

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost({ request, env }) {
  try {
    const { idea, minutes, level } = await safeJson(request);

    // --- Validering ---
    const text = (idea ?? "").toString().trim();
    const mins = clamp(Number(minutes) || 5, 1, 30);
    const lvl  = clamp(Number(level) || 2, 1, 5);

    if (!text) return jerr(400, "Tom idé. Skriv vad berättelsen ska handla om.");
    // Sikta på rimlig längd; håll nere för att ge snabb respons
    const targetWords = Math.min(Math.round(mins * 170), 1200);
    const maxTokens  = Math.min(Math.round(targetWords * 1.6), 1800);

    // --- Prompter ---
    const { system, user } = buildPrompts(text, mins, lvl, targetWords);

    // --- Försök 1: OpenAI ---
    try {
      const out = await callOpenAI(env, system, user, maxTokens);
      return jok({ text: out, excerpt: firstParagraph(out) });
    } catch (e) {
      // endast logikfel/blocks => försök Mistral
      // status 401/403/429/500/>=400 -> prova fallback
      // console.warn("OpenAI fail:", e?.message);
    }

    // --- Försök 2: Mistral (fallback) ---
    const out2 = await callMistral(env, system, user, maxTokens);
    return jok({ text: out2, excerpt: firstParagraph(out2) });

  } catch (err) {
    return jerr(502, err?.message || "Ett oväntat fel inträffade.");
  }
}

// ---------- Helpers ----------

async function safeJson(req) {
  try { return await req.json(); }
  catch { return {}; }
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function toneForLevel(level) {
  // Håller sig icke-grafiskt men skalar hetta/ordval.
  const tones = {
    1: "mycket mild, romantisk, antydande; inga direkta detaljer.",
    2: "mild med varm stämning; subtil sensualitet, respektfullt språk.",
    3: "sensuell, tydligare åtrå, fortfarande eleganta formuleringar.",
    4: "het och djärv, konkreta beskrivningar utan att bli grafisk.",
    5: "mycket het, direkt och passionerad men fortfarande icke-grafisk och respektfull.",
  };
  return tones[level] || tones[2];
}

function buildPrompts(idea, minutes, level, targetWords) {
  const system =
    `Du skriver svenska, vuxna, samtyckande ljudnoveller för uppläsning.
- Alla medverkande är vuxna och samtyckande.
- Inga minderåriga, våld, tvång, diskriminering eller grafiska medicinska detaljer.
- Håll språket levande och naturligt, fokusera på känslor, dofter, beröring, dialog.
- Nivå: ${toneForLevel(level)}
- Längd: ungefär ${targetWords} ord (±20%).
- Skriv i presens, andra person ("du") eller nära tredjeperson, korta stycken för uppläsning.
- Undvik överdrivet mekaniska beskrivningar.`;

  const user =
    `Idé: ${idea}
Önska: en sammanhållen novell för uppläsning på ~${minutes} minut(er).
Avsluta med en naturlig avrundning (inte abrupt).`;

  return { system, user };
}

function firstParagraph(s) {
  const p = s.split(/\n{2,}/).map(x => x.trim()).find(Boolean);
  return p || s.slice(0, 280);
}

async function callOpenAI(env, system, user, maxTokens) {
  if (!env.OPENAI_API_KEY) throw new Error("Saknar OPENAI_API_KEY.");
  const url = "https://api.openai.com/v1/chat/completions";

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.9,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, 45000);

  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!out) throw new Error("OpenAI gav tomt svar.");
  return out;
}

async function callMistral(env, system, user, maxTokens) {
  if (!env.MISTRAL_API_KEY) throw new Error("Saknar MISTRAL_API_KEY.");
  const url = "https://api.mistral.ai/v1/chat/completions";

  const body = {
    model: "mistral-large-latest",
    temperature: 0.9,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, 45000);

  if (!res.ok) throw new Error(`Mistral ${res.status}`);
  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!out) throw new Error("Mistral gav tomt svar.");
  return out;
}

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort("timeout"), ms || 30000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function jok(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function jerr(code, msg) {
  return new Response(JSON.stringify({ error: msg }), {
    status: code,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}
