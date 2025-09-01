// functions/api/_utils.js

export function corsHeaders(request, extra = {}) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-expose-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extra,
  };
}

export function jsonResponse(payload, status = 200, request, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(request, extra),
  });
}

export function badRequest(msg = 'bad request', request) {
  return jsonResponse({ ok: false, error: msg }, 400, request);
}

export function serverError(err = 'server error', request) {
  const detail = typeof err === 'string' ? err : (err?.message || 'error');
  return jsonResponse({ ok: false, error: detail }, 500, request);
}
