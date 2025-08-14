// functions/api/tts.js
export async function onRequestPost(context) {
  const { request, env } = context;

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

    const { text, voice = "alloy", format = "mp3" } = await request.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text saknas" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // OpenAI TTS – välj modell som är tillgänglig på ditt konto (ex. "gpt-4o-mini-tts" eller "tts-1")
    const body = {
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      format, // "mp3" | "wav" | "aac" etc (OpenAI stöder olika; mp3 är enklast)
    };

    const resp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      return new Response(JSON.stringify({ error: "OpenAI TTS error", details: errTxt }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const audioArrayBuffer = await resp.arrayBuffer();

    return new Response(audioArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        ...cors,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
}
