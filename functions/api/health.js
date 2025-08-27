// functions/api/health.js
// Golden Copy v1.2 – robust health-endpoint för BN

import { json, corsHeaders } from "./_utils.js";

export async function onRequest(context) {
  const { request, env } = context;

  // Preflight för CORS
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }
  if (request.method !== "GET") {
    return json({ ok: false, error: "Use GET" }, 405, corsHeaders(request));
  }

  // Statuspayload
  const body = {
    ok: true,
    v: "1.2.0",
    ts: Date.now(),
    hasKey: Boolean(env.OPENAI_API_KEY || env.OPENAI_API_KEY?.length),
  };

  return json(body, 200, corsHeaders(request));
}
