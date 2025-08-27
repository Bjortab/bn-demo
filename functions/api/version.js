// functions/api/version.js
import { json, corsHeaders } from "./_utils.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request) });
  }

  const info = {
    ok: true,
    ts: Date.now(),
    commit: env?.CF_PAGES_COMMIT_SHA || null,
    branch: env?.CF_PAGES_BRANCH || null,
    project: env?.CF_PAGES_PROJECT_NAME || null,
  };
  return json(info, 200, corsHeaders(request));
}
