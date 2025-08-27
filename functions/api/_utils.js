// functions/api/_utils.js
// GC v1.0 – gemensamma helpers för alla API-routes

export function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-expose-headers": "content-type",
    "vary": "origin",
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

export function badRequest(msg = "Bad request", request) {
  return json({ ok: false, error: msg }, 400, corsHeaders(request));
}

export function serverError(err, request) {
  const msg = typeof err === "string" ? err : err?.message || "server error";
  return json({ ok: false, error: "server_error", detail: msg }, 500, corsHeaders(request));
}
