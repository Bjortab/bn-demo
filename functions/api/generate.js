import { json } from "./_utils";

/**
 * Cloudflare Pages Function
 * Kräver att du sätter OPENAI_API_KEY som miljövariabel i projektet (Settings → Environment variables).
 */
export async function onRequestPost({ env, request }) {
  try {
    const body = await request.json();
    const { system, user, level=1, minutes=3 } = body || {};

    if (!env.OPENAI_API_KEY) {
      return json(400, { error: "OPENAI_API_KEY saknas (Cloudflare env)." });
    }

    const prompt = [
      { role:"system", content: system || "Skriv en kort svensk berättelse." },
      { role:"user", content: user || "Skapa en berättelse." }
    ];

    // Anropa OpenAI (Responses API – text)
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{
        "content-type":"application/json",
        "authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: prompt,
        temperature: Math.min(1.2, 0.7 + (level*0.08)),
        max_tokens: Math.min(1500, Math.round(minutes*300)) // enkel approx
      })
    });

    if(!res.ok){
      const txt = await res.text();
      return json(res.status, { error: "OpenAI error", detail: txt });
    }

    const data = await res.json();
    const text = (data?.choices?.[0]?.message?.content || "").trim();
    return json(200, { text });
  } catch (err) {
    return json(500, { error: err.message || String(err) });
  }
}
