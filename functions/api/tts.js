// functions/api/tts.js
export const onRequest = async ({ request, env }) => {
  try {
    const { text, voice = "alloy", speed = 1.0 } = await request.json();
    if (!text || !text.trim()) return new Response("Missing text", { status: 400 });

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return new Response("Missing OPENAI_API_KEY", { status: 500 });

    // OpenAI TTS (svenska stöd via samma endpoint – rösten avgör klang, språket avgörs av texten)
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        input: text,
        voice,
        speed
      })
    });

    if (!res.ok) {
      const e = await res.text();
      return new Response(e || "TTS failed", { status: res.status });
    }

    // Skicka tillbaka som mp3
    return new Response(res.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
};
