// functions/api/tts.js
// POST { text: string, voice?: string, format?: "mp3"|"wav"|"ogg" }
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
      return new Response("Missing OPENAI_API_KEY", { status: 500 });
    }

    const { text = "", voice = "alloy", format = "mp3" } = await request.json();
    if (!text || typeof text !== "string") {
      return cors(new Response("Bad request: 'text' saknas.", { status: 400 }));
    }

    // OpenAI TTS (Text → Speech)
    // Modellnamn som fungerar idag: "gpt-4o-mini-tts" (snabb), alternativt "tts-1"
    const body = {
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      format, // "mp3" | "wav" | "ogg"
    };

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const t = await res.text();
      return cors(new Response(`TTS error: ${t}`, { status: 502 }));
    }

    const audio = await res.arrayBuffer();
    const mime =
      format === "wav" ? "audio/wav" :
      format === "ogg" ? "audio/ogg" :
      "audio/mpeg"; // mp3 default

    return cors(new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "no-store",
      },
    }));
  } catch (e) {
    return cors(new Response(`Serverfel: ${String(e)}`, { status: 500 }));
  }
}

function cors(res) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}
