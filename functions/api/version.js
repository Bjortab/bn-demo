// functions/api/version.js — GC v2.3
import { jsonResponse, corsHeaders } from "./_utils.js";

export async function onRequest({ request, env }) {
  const info = {
    ok: true,
    ts: Date.now(),
    commit: env?.CF_PAGES_COMMIT_SHA || null,
    branch: env?.CF_PAGES_BRANCH || null,
    project: env?.CF_PAGES_PROJECT_NAME || null,
  };
  return jsonResponse(info, 200, request, corsHeaders(request));
}
