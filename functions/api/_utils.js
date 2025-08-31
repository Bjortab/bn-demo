export function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function jsonResponse(obj, status = 200, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(request),
    },
  });
}

export function badRequest(message, request, extra = {}) {
  return jsonResponse({ ok: false, error: message, ...extra }, 400, request);
}

export function serverError(error, request) {
  const msg = (error && error.message) ? error.message : String(error);
  return jsonResponse({ ok: false, error: msg }, 500, request);
}
