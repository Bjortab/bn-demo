// functions/api/generate.js  (GC v2.1 – 2-nivåsläge, 3=>OpenAI, 5=>Mistral)
import { corsHeaders, jsonResponse, badRequest, serverError } from "./_utils.js";

// --- konfig ---
const OPENAI_URL   = "https://api.openai.com/v1/responses";
const MISTRAL_URL  = "https://api.mistral.ai/v1/chat/completions";

// Säkra / rimliga default-värden
const DEFAULTS = {
  minutes: 5,
  maxTokensOpenAI: 1600,     // håll detta <= 2000 på Pages
  maxTokensMistral: 1600
};

// Hjälpfunktion: bygg svensk systemprompt från lexikon + val
function buildSystemPrompt(level) {
  // nivå 3 = sensuell (mjuk, romantisk), nivå 5 = explicit
  if (level >= 5) {
    return "Skriv en mycket erotisk berättelse på svenska i första person. Var explicit, men håll språket naturligt och utan klyschor. Undvik upprepningar. Använd modern svensk erotik-ton. Inga minderåriga eller våld.";
  }
  return "Skriv en sensuell berättelse på svenska i första person. Naturligt språk, romantiskt och mjukt tempo. Undvik klyschor och upprepningar. Inga minderåriga eller våld.";
}

// Hjälpfunktion: bygg user-prompt
function buildUserPrompt({ idea, minutes, level }) {
  const mållängd = Math.round((minutes || DEFAULTS.minutes) * 380); // ~380 ord/min lyssning
  return [
    `Idé: ${idea || "(ingen idé – improvisera sensuellt)"} `,
    `Mållängd: cirka ${mållängd} ord.`,
    `Nivå: ${level >= 5 ? "explicit" : "sensuell"}.`,
    "Håll flyt, naturlig svenska, undvik upprepningar och översättningsklyschor.",
    "Avsluta med en fullständig, tillfredsställande slutkänsla – ingen abrupt avklippning."
  ].join("\n");
}

// --------- API anrop ----------
async function callOpenAI(env, sys, user, max_tokens, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: sys },
          { role: "user",   content: user }
        ],
        // OpenAI Responses API tar INTE emot presence_penalty/frequency_penalty här
        max_output_tokens: max_tokens
      })
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`openai_${res.status}: ${txt}`);
    }
    const data = await res.json();
    // plocka ut första text-svaret
    let story = "";
    if (data.output && data.output.length > 0) {
      const first = data.output[0];
      if (first.content && first.content.length > 0) {
        story = first.content[0].text || "";
      }
    }
    return story.trim();
  } finally {
    clearTimeout(to);
  }
}

async function callMistral(env, sys, user, max_tokens, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  try {
    const res = await fetch(MISTRAL_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "authorization": `Bearer ${env.MISTRAL_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "open-mistral-7b", // stabil & billig; byt till större vid behov
        messages: [
          { role: "system", content: sys },
          { role: "user",   content: user }
        ],
        max_tokens,
        temperature: 0.9,
        top_p: 0.9
      })
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`mistral_${res.status}: ${txt}`);
    }
    const data = await res.json();
    const story = data?.choices?.[0]?.message?.content || "";
    return (story || "").trim();
  } finally {
    clearTimeout(to);
  }
}

// --------- Cloudflare Pages Function handler -----------
export async function onRequestPost({ request, env }) {
  try {
    const { idea, level, minutes } = await request.json();

    // enkel validering
    const lvl = Number(level) || 3;
    const mins = Number(minutes) || DEFAULTS.minutes;
    const sys = buildSystemPrompt(lvl);
    const user = buildUserPrompt({ idea, minutes: mins, level: lvl });

    // routing: 3 => OpenAI, 5 => Mistral (allt annat faller till OpenAI för säkerhets skull)
    let story = "";
    if (lvl >= 5) {
      story = await callMistral(env, sys, user, DEFAULTS.maxTokensMistral);
      // fallback om Mistral felar / rate-limitas
      if (!story) {
        story = await callOpenAI(env, sys, user, DEFAULTS.maxTokensOpenAI);
      }
    } else {
      story = await callOpenAI(env, sys, user, DEFAULTS.maxTokensOpenAI);
    }

    if (!story) return badRequest("tomt svar", request);

    return jsonResponse(
      { ok: true, story, provider: (lvl >= 5 ? "mistral→(ev. fallback openai)" : "openai") },
      200,
      request
    );
  } catch (err) {
    return serverError(err, request);
  }
}

// Hantera CORS preflight
export async function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request) });
}
