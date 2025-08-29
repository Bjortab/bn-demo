// functions/api/health.js — GC v2.3
import { jsonResponse, corsHeaders } from "./_utils.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const present = Boolean(env.OPENAI_API_KEY) || Boolean(env.MISTRAL_API_KEY);
  return jsonResponse(
    { ok: true, v: "2.3", ts: Date.now(), hasKey: present },
    200,
    request
  );
}
