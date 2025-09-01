// functions/api/generate.js
import { corsHeaders, jsonResponse, serverError, badRequest } from './_utils.js';

// OBS: Detta är den “smala” varianten som bara demonstrerar prompt-hanteringen.
// Din övriga logik (OpenRouter/Mistral, nivåer, lexicon, retries, [SLUT], osv.)
// kan ligga kvar under den markerade delen.

export async function onRequestOptions({ request }) {
  return new Response('', { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    // 🔧 Acceptera båda fälten
    const raw = (body.idea ?? body.prompt ?? '').toString().trim();

    const level   = Number(body.level ?? 3);
    const minutes = Number(body.minutes ?? 5);
    const voice   = (body.voice ?? 'alloy').toString();
    const tempo   = Number(body.tempo ?? 0);

    if (!raw) {
      return badRequest('Ingen prompt angiven.', request);
    }

    // (valfritt) enkel input-längd-guard
    if (raw.length < 3) {
      return badRequest('Prompten är för kort.', request);
    }

    // 🔎 Små loggar för felsökning (syns i CF logs)
    console.log('[generate] prompt:', raw.slice(0, 80));
    console.log('[generate] level/min/voice/tempo:', level, minutes, voice, tempo);

    // ================================
    //  DIN BEFINTLIGA GENERERINGSLOGIK
    //  (OpenRouter/Mistral→OpenAI fallback, lexicon för nivå 5, [SLUT], etc.)
    //  Returnera sedan { ok:true, text, provider, model }
    // ================================

    // Dummy-respons för att visa flödet:
    const text = `Demo: mottog prompt "${raw}". [SLUT]`;
    return jsonResponse({ ok: true, text, provider: 'openrouter', model: 'meta-llama-3.1-70b-instruct' }, 200, request);

  } catch (err) {
    console.error('generate error', err);
    return serverError(err, request);
  }
}
