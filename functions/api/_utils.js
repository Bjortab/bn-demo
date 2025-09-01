// functions/api/_utils.js
import crypto from 'crypto';

export function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
  };
}

export function jsonResponse(obj, status = 200, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}

export function badRequest(msg, request) {
  return jsonResponse({ ok: false, error: msg }, 400, request);
}

export function serverError(err, request) {
  console.error(err);
  return jsonResponse({ ok: false, error: String(err) }, 500, request);
}

// 🔑 lägg till sha256 här så andra filer kan importera
export function sha256(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}
