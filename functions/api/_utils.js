export function corsHeaders(request) {
  const origin = request?.headers?.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonResponse(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

export function badRequest(msg = "Bad Request", request) {
  return jsonResponse({ ok: false, error: msg }, 400, corsHeaders(request));
}
export function serverError(msg = "Server error", request) {
  return jsonResponse({ ok: false, error: msg }, 500, corsHeaders(request));
}
