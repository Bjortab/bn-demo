// functions/api/generate.js
import { corsHeaders } from './_utils.js';

/**
 * BN text-generator (Cloudflare Pages Functions)
 * - Läser nyare OpenAI Responses API-svar (data.output[].content[].text)
 * - Returnerar { ok:true, story:"..." } till frontend
 */
export async function onRequest(context) {
  const { request, env } = context;

  try {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Use POST' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    const { level = 1, minutes = 3, userIdea = '' } =
      await request.json().catch(() => ({}));

    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY missing (Cloudflare env)' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    // ungefär 200–220 tokens/minut
    const maxTokensTarget = Math.min(1600, Math.round(minutes * 220));

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          {
            role: 'system',
            content:
              `Du är BN AI. Skriv en svensk berättelse på nivå ${level} ` +
              `med längd ≈ ${minutes} min. Var konsekvent i ton och nivå.`
          },
          {
            role: 'user',
            content: userIdea?.trim() ? userIdea : 'Skapa en romantisk berättelse.'
          }
        ],
        max_output_tokens: maxTokensTarget
      })
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => res.statusText);
      return new Response(JSON.stringify({ ok: false, error: errTxt }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
      });
    }

    const data = await res.json();

    // *** NYTT: hämta text enligt nya schemat ***
    const story =
      data?.output?.[0]?.content?.find(x => x?.type === 'output_text')?.text ??
      data?.output_text?.[0]?.text ?? // fallback om API-form ändras igen
      '';

    return new Response(JSON.stringify({ ok: true, story }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) }
    });
  }
}
