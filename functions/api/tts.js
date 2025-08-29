// functions/api/tts.js  (GC v2 – chunking + retry)
function corsHeaders(request, extra = {}) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-expose-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra,
  };
}

function jsonResponse(payload, status = 200, request, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(request, extra),
  });
}

function badRequest(msg = "bad request", request) {
  return jsonResponse({ ok: false, error: msg }, 400, request);
}

function serverError(err = "server error", request) {
  const detail = typeof err === "string" ? err : (err?.message || "error");
  return jsonResponse({ ok: false, error: detail }, 500, request);
}

// ——— util ———
function splitText(text, maxLen = 1400) {
  // Dela på dubbla radbryt, annars meningar, annars hård split
  const parts = [];
  const paraChunks = text.split(/\n{2,}/g).filter(Boolean);

  for (const para of paraChunks.length ? paraChunks : [text]) {
    if (para.length <= maxLen) {
      parts.push(para.trim());
      continue;
    }
    const sentences = para.split(/(?<=[\.\?\!…])\s+/);
    let buf = "";
    for (const s of sentences) {
      if ((buf + " " + s).trim().length > maxLen) {
        if (buf) parts.push(buf.trim());
        if (s.length > maxLen) {
          // hård split om extremt lång mening
          for (let i = 0; i < s.length; i += maxLen) {
            parts.push(s.slice(i, i + maxLen));
          }
          buf = "";
        } else {
          buf = s;
        }
      } else {
        buf = (buf ? buf + " " : "") + s;
      }
    }
    if (buf) parts.push(buf.trim());
  }
  return parts;
}

async function ttsChunk({ env, text, voice }) {
  // Enkel retry med exponential backoff
  const url = "https://api.openai.com/v1/audio/speech";
  const body = {
    model: "gpt-4o-mini-tts",
    voice: voice || "alloy",
    input: text,
    format: "mp3",
  };

  let delay = 500;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const buf = await res.arrayBuffer();
      // Gör data-URL till klienten (enkelt att spela upp i följd)
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      return `data:audio/mpeg;base64,${b64}`;
    }

    // 429/500 → backoff och prova igen
    if (res.status === 429 || res.status >= 500) {
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
      continue;
    }

    // annat fel → kasta direkt med text
    const errTxt = await res.text().catch(() => "");
    throw new Error(`TTS HTTP ${res.status}: ${errTxt || "error"}`);
  }
  throw new Error("TTS failed after retries");
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const { text, voice } = await request.json().catch(() => ({}));
    if (!text || typeof text !== "string") {
      return badRequest("ingen text till TTS", request);
    }
    if (!env?.OPENAI_API_KEY) {
      return serverError("OPENAI_API_KEY saknas", request);
    }

    // 1) Dela upp texten
    const chunks = splitText(text, 1400);

    // 2) Kör TTS för varje chunk
    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      const url = await ttsChunk({ env, text: chunks[i], voice });
      parts.push(url);
    }

    // 3) Returnera lista av data-URL:er
    return jsonResponse({ ok: true, parts }, 200, request);
  } catch (err) {
    return serverError(err, request);
  }
}
