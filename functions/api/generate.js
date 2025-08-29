// functions/api/generate.js
import { corsHeaders, jsonResponse, serverError } from './_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const { idea, level, minutes } = await request.json();

    // Bygg prompt
    const prompt = `
      Skriv en erotisk novell på svenska.
      Nivå: ${level}.
      Längd: cirka ${minutes} minuter uppläst text.
      Använd flytande och naturligt språk, undvik upprepningar.
    `;

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt,
        max_output_tokens: 1600,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return serverError(`OpenAI error: ${errText}`);
    }

    const data = await res.json();

    let story = "";
    if (data.output && data.output.length > 0) {
      const first = data.output[0];
      if (first.content && first.content.length > 0) {
        story = first.content[0].text || "";
      }
    }

    return jsonResponse({ ok: true, story });
  } catch (err) {
    return serverError(err.message);
  }
}
