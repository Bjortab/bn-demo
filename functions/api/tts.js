// Cloudflare Pages Function: /api/tts
// Läser upp given text med OpenAI TTS. Validerar input och returnerar MP3.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENAI_API_KEY) {
      return jerr(500, "Saknar OPENAI_API_KEY.");
    }

    const { text, voice } = await safeJson(request);
    const input = (text ?? "").toString().trim();
    const voiceId = (voice || "alloy").toString();

    if (!input) return jerr(400, "Tom text att läsa upp.");

    const res = await fetchWithTimeout(
      "https://api.openai.com/v1/audio/speech",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice: voiceId,         // "alloy", "verse", "coral", ...
          input,
          format: "mp3",
        }),
      },
      60000
    );

    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      return jerr(502, `OpenAI TTS error: ${res.status} :: ${errTxt || "okänt fel"}`);
    }

    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "audio/mpeg",
        "Content-Disposition": "inline; filename=bn-tts.mp3",
      },
    });

  } catch (err) {
    const msg = err?.name === "AbortError" ? "TTS avbröts (timeout)." : (err?.message || "Okänt fel.");
    return jerr(502, msg);
  }
}

async function safeJson(req) {
  try { return await req.json(); }
  catch { return {}; }
}

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort("timeout"), ms || 30000);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function jerr(code, msg) {
  return new Response(JSON.stringify({ error: msg }), {
    status: code,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}
