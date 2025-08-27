// functions/api/_utils.js
// Golden Copy v1.2 – stabila utils för BN

// Skapar JSON-respons med CORS
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders,
    },
  });
}

// Standard CORS headers
export function corsHeaders(request) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// Felhantering
export function badRequest(msg = "Bad Request") {
  return json({ ok: false, error: msg }, 400);
}

export function serverError(err) {
  let detail = "";
  try {
    detail = err?.stack || err?.message || String(err);
  } catch (_) {
    detail = "Unknown error";
  }
  return json({ ok: false, error: "Server Error", detail }, 500);
}

// Hjälp för textutdrag
export function safeText(obj, fallback = "") {
  try {
    if (!obj) return fallback;
    if (typeof obj === "string") return obj;
    if (Array.isArray(obj)) {
      return obj.map(x => safeText(x, "")).join(" ");
    }
    if (obj.text) return obj.text;
    if (obj.content) return safeText(obj.content, fallback);
    return JSON.stringify(obj);
  } catch (_) {
    return fallback;
  }
}
