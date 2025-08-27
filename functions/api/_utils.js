// functions/api/_utils.js
// Golden Copy v1.2 – gemensamma helpers för alla API-routes

export function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-expose-headers": "Content-Type",
    "vary": "Origin",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
}

export function json(payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...extra, "content-type": "application/json; charset=utf-8" },
  });
}

export function badRequest(msg = "Bad Request", request) {
  return json({ ok: false, error: msg }, 400, corsHeaders(request));
}

export function serverError(err, request) {
  const detail = typeof err === "string" ? err : err?.message || "Server Error";
  return json({ ok: false, error: "server_error", detail }, 500, corsHeaders(request));
}
