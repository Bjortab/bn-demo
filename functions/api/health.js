import { jsonResponse, corsHeaders } from "./_utils.js";

export async function onRequest(context) {
  const { request, env } = context;

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }

  const present = Boolean(env.OPENAI_API_KEY);
  return jsonResponse(
    { ok: true, v: "1.0", ts: Date.now(), hasKey: present },
    200,
    corsHeaders(request)
  );
}
