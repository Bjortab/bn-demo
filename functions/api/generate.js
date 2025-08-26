import { json } from "./_utils";

/** Cloudflare Pages Function */
export async function onRequestPost({ env, request }) {
  try {
    const body = await request.json();
    const { system, user, level=1, minutes=3 } = body || {};

    if (!env.OPENAI_API_KEY) {
      return json(500, { error: "OPENAI_API_KEY saknas (Cloudflare env)" });
    }

    const msgs = [
      { role: "system", content: system || "Skriv en kort svensk berättelse." },
      { role: "user",   content: user   || "Skapa en berättelse." }
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: Math.min(1.1, 0.7 + (Number(level)||1)*0.08),
        max_tokens: Math.min(1500, Math.round((Number(minutes)||3)*300)),
        messages: msgs
      })
    });

    if (!res.ok) {
      const t = await res.text().catch(()=> "");
      return json(res.status, { error: "OpenAI error", detail: t.slice(0,500) });
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return json(200, { text });
  } catch (e) {
    return json(500, { error: e.message || String(e) });
  }
}
