// functions/api/tts.js
// Cloudflare Pages Functions (Edge Runtime) – OpenAI TTS -> MP3

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });

export const onRequestPost = async ({ request, env }) => {
  try {
    const { text = "", voice = "alloy" } = await request.json();

    if (!env.OPENAI_API_KEY) {
      return json({ ok: false, error: "missing_openai_key" }, 500);
    }
    const clean = String(text || "").trim();
    if (!clean) return json({ ok: false, error: "empty_text" }, 400);

    // Skydda TTS från orimligt långa strängar (kan annars time:a ut)
    const MAX_CHARS = 12000;
    const input = clean.slice(0, MAX_CHARS);

    // OpenAI TTS
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",   // stabil, kostnadseffektiv TTS
        voice: voice || "alloy",    // t.ex. "alloy", "verse", "aria" (beroende på vad som finns)
        input,
        format: "mp3",
      }),
    });

    if (!res.ok) {
      const err = await safeJson(res);
      return json({ ok: false, error: "openai_tts_error", detail: err }, 502);
    }

    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500);
  }
};

// ===== helpers =====
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
  });
}
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
async function safeJson(res) {
  try { return await res.json(); } catch { return { status: res.status }; }
}
