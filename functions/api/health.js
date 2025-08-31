// health.js — Golden Copy stabil
// Enkel ping för att se om API:t lever.

import { corsHeaders } from './_utils.js';

export async function onRequestGet({ request }) {
  return new Response(
    JSON.stringify({ ok: true, service: 'health', at: Date.now() }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...corsHeaders(request),
      },
    }
  );
}

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: corsHeaders(request) });
}

export async function onRequestPost({ request }) {
  return onRequestGet({ request });
}
