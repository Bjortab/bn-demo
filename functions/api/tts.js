// TTS: konverterar text → tal via OpenAI TTS
function cors(h = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...h,
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}

export async function onRequestPost(ctx) {
  try{
    const { text = "", voice = "alloy" } = await ctx.request.json();
    if (!text) return new Response("Missing text", { status: 400, headers: cors() });

    const body = {
      model: "gpt-4o-mini-tts",   // TTS-modell
      voice,                      // alloy | aria | verse | breeze
      input: text,
      format: "mp3"
    };

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ctx.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok){
      const t = await res.text();
      return new Response(`OpenAI TTS error ${res.status}: ${t}`, { status: 502, headers: cors({"Content-Type":"text/plain"}) });
    }

    // Proxy:a vidare ljudet som binär ström
    const headers = cors({ "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
    return new Response(res.body, { status: 200, headers });
  }catch(err){
    return new Response(`TTS failed: ${String(err?.message || err)}`, { status: 500, headers: cors({"Content-Type":"text/plain"}) });
  }
}
