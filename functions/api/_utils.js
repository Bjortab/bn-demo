// functions/api/_utils.js
// Golden copy – gemensamma helpers för alla API-routes (Cloudflare Pages Functions)

//// CORS ///////////////////////////////////////////////////////////////

export function corsHeaders(request) {
  const origin = request?.headers?.get?.("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store"
  };
}

export function isOptions(request) {
  return request?.method?.toUpperCase() === "OPTIONS";
}

export function preflight(request) {
  // 204 No Content för CORS preflight
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

//// JSON / Response helpers ///////////////////////////////////////////

export function jsonResponse(data, status = 200, extra = {}) {
  const base = { "Content-Type": "application/json" };
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...base, ...extra }
  });
}

// Alias – vissa filer kan använda json(...)
export const json = jsonResponse;

export function textResponse(text, status = 200, extra = {}) {
  const base = { "Content-Type": "text/plain; charset=utf-8" };
  return new Response(text, { status, headers: { ...base, ...extra } });
}

export function badRequest(request, message = "Bad Request") {
  return jsonResponse({ ok: false, error: message }, 400, corsHeaders(request));
}

export function notFound(request, message = "Not Found") {
  return jsonResponse({ ok: false, error: message }, 404, corsHeaders(request));
}

export function serverError(request, err) {
  const msg =
    (err && (err.message || err.toString && err.toString())) ||
    "Internal Server Error";
  return jsonResponse({ ok: false, error: msg }, 500, corsHeaders(request));
}

//// Request utils //////////////////////////////////////////////////////

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function getBearerFromHeader(request) {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

//// Env / Config helpers //////////////////////////////////////////////

// Hämta OpenAI-nyckel. Vi stödjer både OPENAI_API_KEY och en alternativ
// RESTAR_API_KEY om du vill spegla den i Cloudflare.
export function getOpenAIKey(env) {
  return env?.OPENAI_API_KEY || env?.RESTAR_API_KEY || null;
}

// Praktisk headerbyggare för OpenAI
export function openAIHeaders(env) {
  const key = getOpenAIKey(env);
  if (!key) return null;
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };
}

//// Små helpers ////////////////////////////////////////////////////////

export function clampNumber(n, min, max, fallback) {
  const v = Number(n);
  if (Number.isFinite(v)) return Math.min(max, Math.max(min, v));
  return fallback;
}

export function pick(val, fallback) {
  return val === undefined || val === null ? fallback : val;
}
