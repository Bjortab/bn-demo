// functions/api/generate.js
import { corsHeaders, serverError } from './_utils.js';

const SYS_POWER = `
Du skriver korta erotiska berättelser på svenska.
Anpassa intensitet efter nivå (nivå 1 mild, nivå 3 mellan, nivå 5 explicit).
Svara med naturlig flyt; korrekt svenska; undvik upprepningar; väv in kontext från användarens idé.
Nivå 4 = explicit, nivå 5 = mycket explicit (men utan olagligt innehåll).
Avsluta med en kort “landning” och undvik att bryta stilen.
`;

function budgetTokens(minutes) {
  // ca 120/360/600 token – ger ~30s/90s/150s tal (TTS ~3–4 tok/s)
  if (minutes <= 1) return 120;
  if (minutes <= 3) return 360;
  return 600;
}

function levelInstruction(level = 3) {
  const l = Number(level) || 3;
  switch (l) {
    case 1: return "Håll tonen varm och subtil (romantisk, mjuk sensualitet).";
    case 2: return "Låg till måttlig erotik, antydningar, mjukt språk.";
    case 3: return "Mellan – tydligt erotiskt men inte rått.";
    case 4: return "Explicit – direkta ord, tydliga beskrivningar, samtycke och trygghet.";
    case 5: return "Mycket explicit – raka könsord och detaljer, varierat språk, fortfarande samtycke.";
    default: return "Mellan – tydligt erotiskt men inte rått.";
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  // CORS / preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok:false, error:'Use POST' }), {
      status: 405, headers: { 'Content-Type':'application/json', ...corsHeaders(request) }
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const idea   = (body.idea ?? "").toString().trim();
    const level  = Number(body.level ?? 3);
    const minutes= Number(body.minutes ?? 3);

    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ ok:false, error:'OPENAI_API_KEY missing (Cloudflare env)' }), {
        status: 500, headers: { 'Content-Type':'application/json', ...corsHeaders(request) }
      });
    }

    // Bygg prompt som väver in NIVÅ + IDÉ + längd
    const sys = SYS_POWER;
    const user = `
Nivå: ${level} — ${levelInstruction(level)}
Mål-längd: ${minutes} min tal (inte för kort).
Idé att använda: ${idea || "(om ingen idé: skapa en komplett, sammanhängande scen med två vuxna, på svenska)"}
Skriv i ett stycke-flöde (du får gärna variera tempot med korta pauser/meningar).
`.trim();

    const tokens = budgetTokens(minutes);

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          { role: 'system', content: sys },
          { role: 'user',   content: user }
        ],
        // token-budget styr längden; låt modellen fylla den
        max_output_tokens: tokens,
        temperature: 0.9,   // lite mer variation
        top_p: 0.95
      })
    });

    if (!res.ok) {
      const errtxt = await res.text().catch(()=>'');
      return new Response(JSON.stringify({ ok:false, error: errtxt || res.statusText }), {
        status: res.status, headers: { 'Content-Type':'application/json', ...corsHeaders(request) }
      });
    }

    const data = await res.json().catch(()=> ({}));
    // Responses API: text ligger i data.output_text
    const story = (data.output_text || "").trim();

    return new Response(JSON.stringify({ ok:true, story }), {
      status: 200, headers: { 'Content-Type':'application/json', ...corsHeaders(request) }
    });

  } catch (err) {
    return new Response(JSON.stringify(serverError(err)), {
      status: 500, headers: { 'Content-Type':'application/json', ...corsHeaders(request) }
    });
  }
}
