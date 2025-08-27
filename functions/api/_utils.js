// functions/api/_utils.js
export const corsHeaders = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization"
};

export function badRequest(msg = "Bad Request") {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status: 400, headers: corsHeaders
  });
}

export function serverError(msg = "Server error") {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status: 500, headers: corsHeaders
  });
}

export function corsHeadersText() {
  return {
    "content-type": "text/plain; charset=utf-8",
    "access-control-allow-origin": "*"
  };
}
