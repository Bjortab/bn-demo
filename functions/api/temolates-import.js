// functions/api/templates-import.js
import { corsHeaders, jsonResponse, serverError, sha256 } from "./_utils.js";

export async function onRequestOptions({ request }) {
  return new Response("", { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = request.headers.get("authorization") || "";
    if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401, request);
    }

    const { templates } = await request.json();
    if (!Array.isArray(templates) || !templates.length) {
      return jsonResponse({ ok: false, error: "No templates provided" }, 400, request);
    }

    const indexRaw = await env.BN_KV.get("templates_index");
    const index = indexRaw ? JSON.parse(indexRaw) : [];

    const added = [];
    for (const tpl0 of templates) {
      const tpl = { ...tpl0 };
      if (!tpl.id) {
        tpl.id = `tpl_${await sha256((tpl.title || "no-title") + Date.now())}`.slice(0, 16);
      }
      tpl.version = Number(tpl.version || 1);
      tpl.language = tpl.language || "sv";
      tpl.text_template = String(tpl.text_template || "").trim();
      if (!tpl.text_template.endsWith("[SLUT]")) tpl.text_template += "\n\n[SLUT]";

      await env.BN_KV.put(`templates/${tpl.id}`, JSON.stringify(tpl));
      if (!index.includes(tpl.id)) index.push(tpl.id);
      added.push(tpl.id);
    }

    await env.BN_KV.put("templates_index", JSON.stringify(index));
    return jsonResponse({ ok: true, added, count: added.length }, 200, request);
  } catch (err) { return serverError(err, request); }
}
