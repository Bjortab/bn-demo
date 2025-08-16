// /functions/api/tts.js
// Skapar tal via OpenAI TTS. Default speed = 1.0. 60s timeout.

export const onRequestPost = async ({ request, env }) => {
  try {
    const { text = "", voice = "alloy", speed = 1.0 } = await request.json();

    if (typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "empty_text" }), { status: 400 });
    }
    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "missing_openai_key" }), { status: 500 });
    }

    // Klampa hastighet 0.8–1.5, default 1.0
    const rate = Math.max(0.8, Math.min(1.5, Number(speed) || 1.0));

    const signal = AbortSignal.timeout(60000); // 60s timeout

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: voice || "alloy",
        input: text,
        speed: rate,        // <-- hastighet
        format: "mp3"
      }),
      signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: "openai_tts_error", detail: errText }), { status: 502 });
    }

    // Proxy:a binärt mp3 till klienten
    const arrayBuf = await res.arrayBuffer();
    return new Response(arrayBuf, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store"
      }
    });

  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "timeout" : (err?.message || "unknown");
    return new Response(JSON.stringify({ error: "server_error", detail: msg }), { status: 500 });
  }
};
