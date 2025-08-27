import { jsonResponse, corsHeaders, preflight } from "./_utils.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return preflight(request);
  const hasKey = !!(env.OPENAI_API_KEY || env.RESTAR_API_KEY);
  return jsonResponse({ ok: true, v: "1.2", ts: Date.now(), hasKey }, 200, corsHeaders(request));
}
