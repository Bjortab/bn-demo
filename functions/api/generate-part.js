// functions/api/generate-part.js
import { corsHeaders, jsonResponse, serverError } from './_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const { idea, level, minutes, partIndex, totalParts, prevTail } = await request.json();

    // Bestäm hur många tokens per del vi tillåter
    const tokensPerPart = 800; // ca 3–4 min text
    const currentPart = partIndex + 1;
    const total = totalParts > 0 ? totalParts : Math.ceil((minutes * 160) / 400); 
    // (snitt: 160 ord/min, 400 ord ≈ 800 tokens)

    const prompt = `
      Detta är del ${currentPart} av ${total} i en erotisk berättelse på svenska.
      Nivå: ${level}.
      Idé: ${idea}.
      Föregående avslutning: ${prevTail || "(ingen)"}

      Fortsätt berättelsen med flyt, utan att repetera tidigare del.
      Gör denna del cirka ${tokensPerPart} tokens lång.
      Avsluta med en mening som kan leda naturligt vidare.
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
        max_output_tokens: tokensPerPart,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return serverError(`OpenAI error: ${errText}`);
    }

    const data = await res.json();

    let storyPart = "";
    if (data.output && data.output.length > 0) {
      const first = data.output[0];
      if (first.content && first.content.length > 0) {
        storyPart = first.content[0].text || "";
      }
    }

    return jsonResponse({
      ok: true,
      storyPart,
      partIndex,
      totalParts: total
    });
  } catch (err) {
    return serverError(err.message);
  }
}
