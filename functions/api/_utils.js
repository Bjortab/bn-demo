// functions/api/_utils.js — Golden Copy
export function corsHeaders(request) {
  const origin = request?.headers?.get('origin') || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
}
export function jsonResponse(obj, status = 200, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(request), 'content-type': 'application/json; charset=utf-8' },
  });
}
export function badRequest(message = 'Bad Request', request) {
  return jsonResponse({ ok: false, error: message }, 400, request);
}
export function serverError(err, request) {
  const msg = (typeof err === 'string') ? err : (err?.stack || err?.message || 'Server Error');
  return jsonResponse({ ok: false, error: 'server_error', detail: msg }, 500, request);
}
export async function handleOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request) });
}
