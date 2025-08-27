// functions/api/_utils.js — GC v1.1

// CORS-headrar för alla API-routes
export function corsHeaders(request, extra = {}) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-expose-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra
  };
}

// Standardiserat JSON-svar
export function jsonResponse(payload, status = 200, request, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(request, extra)
  });
}

// Felsvar (400)
export function badRequest(msg = "Bad request", request) {
  return jsonResponse({ ok: false, error: msg }, 400, request);
}

// Felsvar (500)
export function serverError(err = "Server error", request) {
  const detail = typeof err === "string" ? err : (err?.message || "error");
  return jsonResponse({ ok: false, error: detail }, 500, request);
}
