// functions/api/generate.js
import { corsHeaders, jsonResponse, badRequest, serverError } from './_utils.js';

export async function onRequestOptions({ request }) {
  return new Response('', { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    const { prompt, level = 3, maxTokens = 800 } = await request.json().catch(() => ({}));
    if (!prompt || !prompt.trim()) {
      return badRequest('Ingen prompt angiven.', request);
    }

    // --- välj provider beroende på nivå ---
    let provider = 'openrouter';
    let model = 'meta-llama/llama-3.1-70b-instruct'; // default

    if (level === 3) {
      // sensuell/mjuk nivå
      provider = 'openrouter';
      model = 'meta-llama/llama-3.1-70b-instruct';
    } else if (level === 5) {
      // explicit nivå → lexicon kan blandas in här senare
      provider = 'openrouter';
      model = 'meta-llama/llama-3.1-70b-instruct';
    }

    // --- bygg request body ---
    const body = {
      model,
      prompt: `${prompt}\n\nSkriv på svenska.`,
      max_tokens: maxTokens,
      temperature: 0.9,
    };

    // --- hämta rätt API-nyckel ---
    let apiKey = null;
    let url = null;

    if (provider === 'openrouter') {
      apiKey = env.OPENROUTER_API_KEY;
      url = 'https://openrouter.ai/api/v1/chat/completions';
      body['messages'] = [
        { role: 'system', content: 'Du är en svensk berättarröst. Skriv naturligt och flytande.' },
        { role: 'user', content: prompt },
      ];
      delete body.prompt; // openrouter kräver messages-formatet
    }

    if (!apiKey) {
      return serverError(`Ingen API-nyckel för ${provider}`, request);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return serverError(`Fel från ${provider}: HTTP ${res.status} ${txt}`, request);
    }

    const data = await res.json().catch(() => null);
    const text =
      data?.choices?.[0]?.message?.content?.trim() ||
      data?.choices?.[0]?.text?.trim() ||
      '';

    if (!text) {
      return serverError('Tomt svar från modellen.', request);
    }

    // Lägg till [SLUT]-tagg så vi ser att texten blev komplett
    const finalText = text.endsWith('[SLUT]') ? text : text + '\n\n[SLUT]';

    return jsonResponse(
      {
        ok: true,
        provider,
        model,
        text: finalText,
      },
      200,
      request
    );
  } catch (err) {
    return serverError(err, request);
  }
}
