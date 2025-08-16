// functions/api/generate.js
// Textgenerering via Mistral + robust metod/CORS-hantering

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export async function onRequest({ request, env }) {
  const { method } = request;

  // Preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Tillåt bara POST för riktig körning
  if (method !== "POST") {
    return json(405, { error: "method_not_allowed", ok: false });
  }

  try {
    const { idea = "", level = 2, minutes = 5 } = await request.json()
      .catch(() => ({}));

    if (!idea || !idea.trim()) {
      return json(400, { error: "empty_idea", ok: false });
    }

    const apiKey = env.MISTRAL_API_KEY;
    if (!apiKey) {
      return json(500, { error: "missing_mistral_key", ok: false });
    }

    // Ord/tempo (≈170 ord/min). Sätt ett tak för att inte dra iväg för mkt i test.
    const targetWords = Math.max(220, Math.min(900, Math.round(minutes * 170)));

    // Styrning per nivå (1–5). 1 = romantisk/antydande, 5 = het (icke-grafisk).
    const toneByLevel = {
      1: "Romantiskt, varmt och antydande. Undvik konkreta sexuella ord; fokusera på stämning, nerv och känslor.",
      2: "Mild sensualism, varma blickar, nära kroppsspråk. Inga grafiska ord.",
      3: "Tydlig sensualitet med några konkreta men rumsrena ord. Fortfarande icke-grafiskt.",
      4: "Hetare tempo, flera explicita men icke-grafiska uttryck. Respektfullt och samtycke.",
      5: "Maximalt hett (utan grafiska detaljer). Använd ord/fraser från vuxen ordlista: 'lem', 'sköte', 'hans hand runt min midja', 'våt', 'han tränger djupare', 'hon rider honom', 'kyssar längs halsen', etc. Håll det tydligt samtyckande och vuxet.",
    };

    const levelDesc = toneByLevel[level] ?? toneByLevel[2];

    const systemPrompt = [
      "Du skriver en svensk, flytande erotiskt laddad ljudnovell där alla parter är vuxna och samtyckande.",
      "Aldrig minderåriga, aldrig droger/övergrepp, aldrig grafiska kroppsvätske-/våldsdetaljer.",
      "Skriv naturligt, mänskligt och med musikalisk rytm; undvik klyschig upprepning.",
    ].join(" ");

    const userPrompt = [
      `Idé: ${idea.trim()}`,
      `Längd: cirka ${targetWords} ord (≈${minutes} minuter).`,
      `Nivå: ${level} — ${levelDesc}`,
      "Skriv i jag-form eller nära tredjeperson, anpassa så det låter som en berättarröst.",
      "Avsluta med en mjuk avrundning som låter lyssnaren andas ut (ingen hård tvärstopp).",
    ].join("\n");

    // Mistral chat completions
    const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: Math.min(2048, Math.round(targetWords * 1.5)),
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return json(502, { ok: false, error: "mistral_error", detail: errText });
    }

    const data = await resp.json().catch(() => ({}));
    const content =
      data?.choices?.[0]?.message?.content?.trim?.() || "";

    if (!content) {
      return json(502, { ok: false, error: "empty_model_output" });
    }

    // Litet utdrag för UI
    const excerpt = content.split(/\s+/).slice(0, 55).join(" ") + " …";

    return json(200, { ok: true, text: content, excerpt });
  } catch (err) {
    return json(500, { ok: false, error: "server_error", detail: String(err) });
  }
}
