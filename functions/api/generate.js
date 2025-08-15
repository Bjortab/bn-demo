// functions/api/generate.js
// POST { prompt: string, minutes?: number, spice?: number }
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ error: "Missing OPENAI_API_KEY on server." }, 500);
    }

    const { prompt = "", minutes = 5, spice = 2 } = await request.json();
    if (!prompt || typeof prompt !== "string") {
      return json({ error: "Bad request: 'prompt' saknas." }, 400);
    }

    // ca 170 ord/min i normal uppläsning
    const targetWords = Math.max(120, Math.min(2000, Math.round(minutes * 170)));
    const spiceSafe = Math.max(1, Math.min(5, Number(spice) || 2));

    const system = [
      "Du skriver korta, romantiska berättelser på svenska mellan VUXNA, helt samtyckande personer.",
      "Undvik minderåriga, våld, tvång eller förbjudna teman.",
      "Ton: sensuell, filmisk och respektfull. Undvik för grov detaljbeskrivning.",
      `Längd: cirka ${targetWords} ord.`,
      `Intensitet (1-5): ${spiceSafe}. Anpassa språkets hetta efter detta tal.`,
      "Avsluta berättelsen med en naturlig avrundning (ingen fortsättning krävs).",
    ].join(" ");

    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Idé: ${prompt}\nSkriv berättelsen nu.` },
      ],
      temperature: 0.9,
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      return json({ error: "OpenAI error", detail: errTxt }, 502);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    if (!text) return json({ error: "Tomt svar från modellen." }, 502);

    return json({ text });
  } catch (e) {
    return json({ error: "Serverfel", detail: String(e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
