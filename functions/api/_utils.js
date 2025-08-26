// Cloudflare utils: JSON-svar, fel, CORS
export function json(data, init = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status: typeof init === "number" ? init : (init?.status ?? 200),
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

export function text(body, init = 200, extraHeaders = {}) {
  return new Response(body, {
    status: typeof init === "number" ? init : (init?.status ?? 200),
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

export function corsHeaders(req) {
  const origin = req.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type"
  };
}

export function ok() { return json({ ok: true, ts: Date.now() }); }

export function badRequest(message = "Bad Request") {
  return json({ ok: false, error: message }, 400);
}

export function serverError(err) {
  const msg = typeof err?.message === "string" ? err.message : String(err);
  return json({ ok: false, error: msg }, 500);
}
