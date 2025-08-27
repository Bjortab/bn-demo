import { json, corsHeaders } from "./_utils.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return preflight(request);
  const info = {
    ok: true,
    ts: Date.now(),
    project: env?.CF_PAGES_PROJECT_NAME || null,
    branch:  env?.CF_PAGES_BRANCH || null,
    commit:  env?.CF_PAGES_COMMIT_SHA || null
  };
  return jsonResponse(info, 200, corsHeaders(request));
}
