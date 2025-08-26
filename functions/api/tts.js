export const onRequest = async ({ request, env }) => {
  try {
    const { text, voice = "alloy", speed = 1.0 } = await request.json();
    if (!text || !text.trim()) return new Response("Missing text", { status: 400 });

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY saknas i Cloudflare env.");

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        input: text,
        voice,
        speed: Math.max(0.5, Math.min(2.0, Number(speed) || 1.0)),
        format: "mp3"
      })
    });

    if (!res.ok) {
      const msg = await res.text().catch(()=>"TTS error");
      return new Response(msg, { status: res.status });
    }

    return new Response(res.body, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store"
      }
    });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
};
