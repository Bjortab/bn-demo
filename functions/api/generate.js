// functions/api/generate.js
export async function onRequestPost(context) {
  const { request, env } = context;

  // Enkla CORS-rubriker (justera Origin om du vill låsa ner)
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const { prompt, level = 1, spice = 0, length = "kort" } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "prompt saknas" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // Liten “styrtext” som håller berättelserna generella och lyssningsvänliga.
    const systemMessage =
      "Du är en skicklig berättare. Skriv engagerande, sammanhängande, hyggligt ofarliga berättelser utan explicit innehåll. Håll tonen mänsklig och naturlig.";

    // Översätt val till nåt modellen förstår
    const lengthMap = {
      kort: "cirka 1–2 minuter",
      mellan: "cirka 3–5 minuter",
      lång: "cirka 8–10 minuter",
    };
    const targetLen = lengthMap[length] || "cirka 1–2 minuter";
    const spiceHint =
      spice <= 0 ? "låg intensitet" : spice >= 4 ? "hög intensitet (men icke-explicit)" : "måttlig intensitet";

    const userMessage = `
Skriv en berättelse på ${targetLen}, nivå ${level}, med ${spiceHint}.
Utgå från idén: "${prompt}".
Skriv i jag-form och gör dialogerna levande. Avsluta med en naturlig avrundning.
`;

    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
      temperature: 0.9,
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      return new Response(JSON.stringify({ error: "OpenAI error", details: errTxt }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const data = await resp.json();
    const story = data?.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ story }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
}
