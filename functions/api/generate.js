// functions/api/generate.js
import { corsHeaders, jsonResponse, serverError, sanitizeIdea, normalizeFirstName } from "./_utils.js";

export async function onRequestOptions({ request }) {
  return new Response("", { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const { idea, level = 3, minutes = 5, tags = [], name = "" } = await request.json().catch(() => ({}));

    const check = sanitizeIdea(idea);
    if (!check.ok) return jsonResponse({ ok: false, error: check.error }, 400, request);
    const lvl = Number(level) || 3;
    const mins = Math.min(20, Math.max(3, Number(minutes) || 5));
    const wantedTags = Array.isArray(tags) ? tags.map(t => String(t).toLowerCase()) : [];
    const firstName = normalizeFirstName(name);

    const indexRaw = await env.BN_KV.get("templates_index");
    const ids = indexRaw ? JSON.parse(indexRaw) : [];
    if (!ids.length) return jsonResponse({ ok: false, error: "Inga mallar uppladdade ännu." }, 500, request);

    const candidates = [];
    for (const id of ids) {
      const raw = await env.BN_KV.get(`templates/${id}`);
      if (!raw) continue;
      const tpl = JSON.parse(raw);
      if (Number(tpl.level) !== lvl) continue;
      if (Number(tpl.minutes) !== mins) continue;
      if (wantedTags.length && !wantedTags.every(t => tpl.tags.map(x => x.toLowerCase()).includes(t))) continue;
      candidates.push(tpl);
    }

    if (!candidates.length) {
      return jsonResponse({ ok: false, error: "Hittade ingen passande mall för valda nivå/längd." }, 404, request);
    }

    const tpl = candidates[Math.floor(Math.random() * candidates.length)];

    let text = tpl.text_template;
    if (firstName && Array.isArray(tpl.name_slots) && tpl.name_slots.length) {
      for (const slot of tpl.name_slots.slice(0, 2)) {
        text = text.replaceAll(`{{${slot}}}`, firstName);
      }
      text = text.replaceAll(/\{\{NAME_OPT\}\}/g, "");
    } else {
      text = text.replaceAll(/\{\{NAME_OPT\}\}/g, "");
    }

    return jsonResponse(
      { ok: true, provider: "templates", model: "-", templateId: tpl.id, version: tpl.version, text },
      200,
      request
    );
  } catch (err) { return serverError(err, request); }
}
