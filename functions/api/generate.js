// functions/api/generate.js
// Golden Copy v3 – Mistral only (nivå 3 & 5), med retries + fallback-text

// Hjälpfunktioner för svar
function corsHeaders(request, extra = {}) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-expose-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra,
  };
}

function jsonResponse(payload, status = 200, request, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(request, extra),
  });
}

function badRequest(msg = "Bad request", request) {
  return jsonResponse({ ok: false, error: msg }, 400, request);
}

function serverError(err = "Server error", request) {
  const detail = typeof err === "string" ? err : (err.message || "error");
  return jsonResponse({ ok: false, error: detail }, 500, request);
}

// Hämta fras från lexikon om nivå = 5
async function getLexiconPhrase(env) {
  try {
    const res = await fetch(env.LEXICON_URL || "https://bn-demo01.pages.dev/lexicon.json");
    if (!res.ok) return null;
    const data = await res.json();
    if (data["5_explicit"]) {
      const arr = data["5_explicit"];
      return arr[Math.floor(Math.random() * arr.length)];
    }
    return null;
  } catch {
    return null;
  }
}

// Funktion för att anropa Mistral med retries
async function callMistral(env, prompt, maxTokens, retries = 5) {
  const url = "https://api.mistral.ai/v1/completions";

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-large-latest",
          prompt,
          max_tokens: maxTokens,
          temperature: 0.9,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Mistral fel (försök ${attempt}/${retries}): ${res.status} ${errText}`);
      }

      const data = await res.json();
      if (data && data.choices && data.choices[0].text) {
        return { ok: true, text: data.choices[0].text.trim() };
      } else {
        throw new Error("Mistral svarade utan text.");
      }
    } catch (err) {
      if (attempt === retries) {
        return { ok: false, error: `Mistral misslyckades efter ${retries} försök. Försök igen om några minuter.` };
      }
      // Vänta lite längre för varje försök (0.5s, 1s, 2s, 4s …)
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
    }
  }
}

// Huvudfunktion
export async function onRequestPost({ request, env }) {
  try {
    const { idea, level, minutes = 5 } = await request.json();
    if (!idea || !level) return badRequest("Idé och nivå krävs", request);

    const tokens = Math.min(800 * minutes, 4000); // max tokens per berättelse

    // Bygg prompt
    let prompt = `Skriv en berättelse på svenska.\nIdé: ${idea}\nLängd: ca ${minutes} min.\n`;

    if (level === "3") {
      prompt += "Ton: sensuell, romantisk, subtil. Inga råa detaljer.\n";
    } else if (level === "5") {
      prompt += "Ton: mycket explicit, rå, erotisk. Använd könsord och grafiska detaljer.\n";
      const phrase = await getLexiconPhrase(env);
      if (phrase) prompt += `Inkludera frasen: "${phrase}".\n`;
    } else {
      prompt += "Ton: neutral.\n";
    }

    // Kör mot Mistral (både nivå 3 och 5 går hit nu)
    const result = await callMistral(env, prompt, tokens);

    if (!result.ok) {
      return serverError(result.error, request);
    }

    return jsonResponse({ ok: true, text: result.text }, 200, request);

  } catch (err) {
    return serverError(err, request);
  }
}
