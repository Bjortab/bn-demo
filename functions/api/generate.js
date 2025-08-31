// functions/api/generate.js
// Bygger en hel berättelse, loopar tills [SLUT] eller godkända slutkriterier uppfylls.
// Primärt via OpenRouter (billigt & tolerant), fallback Mistral -> OpenAI.

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "cache-control": "no-store",
};

function json(payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}
export function onRequestOptions() { return new Response(null, { status: 204, headers: CORS }); }
export function onRequestGet() { return json({ ok: true, hint: "POST { idea, level, minutes }" }); }

// ————— providers —————
async function callOpenRouter(env, prompt, maxTokens, temperature = 0.8, model = "meta-llama/llama-3.1-70b-instruct") {
  const key = env.OPENROUTER_API_KEY;
  if (!key) throw new Error("saknar OPENROUTER_API_KEY");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://bn-demo01.pages.dev",
      "X-Title": "Blush Narratives",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: PROMPT_SYS },
        { role: "user", content: prompt }
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const err = new Error(`openrouter_${res.status}`);
    err.detail = t;
    throw err;
  }
  const data = await res.json();
  const txt = data?.choices?.[0]?.message?.content || "";
  return { provider: "openrouter", model: data?.model || model, text: txt };
}

async function callMistral(env, prompt, maxTokens, temperature = 0.8, model = "mistral-large-latest") {
  const key = env.MISTRAL_API_KEY;
  if (!key) throw new Error("saknar MISTRAL_API_KEY");
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: PROMPT_SYS },
        { role: "user", content: prompt }
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const err = new Error(`mistral_${res.status}`);
    err.detail = t;
    throw err;
  }
  const data = await res.json();
  const txt = data?.choices?.[0]?.message?.content || "";
  return { provider: "mistral", model, text: txt };
}

async function callOpenAI(env, prompt, maxTokens, temperature = 0.8, model = "gpt-4o-mini") {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error("saknar OPENAI_API_KEY");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: PROMPT_SYS },
        { role: "user", content: prompt }
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const err = new Error(`openai_${res.status}`);
    err.detail = t;
    throw err;
  }
  const data = await res.json();
  const txt = data?.choices?.[0]?.message?.content || "";
  return { provider: "openai", model, text: txt };
}

// ————— promptbyggare —————
const PROMPT_SYS =
  "Du skriver sammanhängande erotiska berättelser på svenska som håller röd tråd, naturlig grammatik och rytm. " +
  "Inga klyschor, undvik upprepningar. Placera tydlig tagg [SLUT] allra sist när berättelsen verkligen är klar. " +
  "Skriv i jag-form om inte annat anges. Inga riktiga kändisar eller fullständiga namn får förekomma.";

function makeGuide(level) {
  // 1 romantisk … 5 explicit (lexicon ord hanteras i app eller tidigare steg)
  const L = Number(level || 3);
  if (L <= 1) return "Ton: romantisk, inga kroppsliga detaljer.";
  if (L === 2) return "Ton: sensuell, antyd, inga könsord.";
  if (L === 3) return "Ton: sensuell+, mjuk vuxenprosa, minimalt med könsord.";
  if (L === 4) return "Ton: het, inga grova ord; fokus nerv, känsla, kropp.";
  return "Ton: explicit, progressiv stegring; ändå sammanhängande, respektfullt språk.";
}

function buildUserPrompt(idea, level, minutes, prevText = "", partIndex = 1) {
  const guide = makeGuide(level);
  const target = Math.max(2, Number(minutes || 5));
  const header = prevText
    ? `Fortsätt texten nedan utan att upprepa. Avsluta hela berättelsen inom ca ${target} minuter.`
    : `Skriv en berättelse ca ${target} minuter.`;
  const tail = prevText ? `\n\n[Fortsetter härifrån]\n${prevText}\n` : "";
  return [
    header,
    `Nivå: ${level}. ${guide}`,
    `Idé: ${idea || "(ingen idé)"}`,
    tail,
    "Avsluta först när historien är färdig och sätt taggen [SLUT] allra sist."
  ].join("\n");
}

// ————— hjälpare —————
function isComplete(text) {
  if (!text) return false;
  if (/\[SLUT\]\s*$/i.test(text.trim())) return true;
  // Reserv: minst en ‘hel’ avslutning
  return /[.!?…]\s*$/.test(text.trim()) && text.trim().length > 600;
}
function cleanOut(text) {
  return String(text || "")
    .replace(/\s+\[SLUT\]\s*$/i, "[SLUT]")
    .replace(/\u0000/g, "")
    .trim();
}

// ————— main —————
export async function onRequestPost({ request, env }) {
  try {
    const { idea, level, minutes } = await request.json();
    if (!idea || typeof idea !== "string") return json({ ok: false, error: "Skriv en idé först." }, 400);

    // Grov budget för tokens baserat på minuter
    const totalBudget = Math.min(2400, Math.max(600, Math.floor(Number(minutes || 5) * 420)));
    const passBudget = Math.min(800, Math.max(400, Math.floor(totalBudget / 3)));
    const maxLoops = 4;

    let story = "";
    let provider = "-", model = "-";
    for (let i = 0; i < maxLoops; i++) {
      const prompt = buildUserPrompt(idea, level, minutes, story, i + 1);
      // prioritera OpenRouter -> Mistral -> OpenAI
      let chunk = null;
      try {
        chunk = await callOpenRouter(env, prompt, passBudget, 0.85);
      } catch (e1) {
        try {
          chunk = await callMistral(env, prompt, passBudget, 0.85);
        } catch (e2) {
          chunk = await callOpenAI(env, prompt, passBudget, 0.85);
        }
      }
      provider = chunk.provider; model = chunk.model;
      story += (story ? "\n\n" : "") + (chunk.text || "");
      story = story.replace(/[\uD800-\uDFFF]/g, ""); // ta bort trasiga surrogat

      if (isComplete(story)) break;
    }

    story = cleanOut(story);
    if (!/\[SLUT\]$/.test(story)) story += "\n\n[SLUT]";

    return json({ ok: true, provider, model, complete: true, text: story });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err), detail: err?.detail || "" }, 500);
  }
}
