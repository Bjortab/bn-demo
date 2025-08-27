import { jsonResponse, corsHeaders, badRequest, serverError, readJson, openAIHeaders } from "./_utils.js";

// Enkel TTS-stylizer – transformerar berättelsen till en TTS-vänlig variant
function stylizeForTTS(input) {
  if (!input || typeof input !== "string") return "";

  let t = input;

  // 1) Byt ut våra diskreta markörer mot paus-tecken som TTS faktiskt reagerar på
  t = t.replace(/\[p:kort\]/g, " …");
  t = t.replace(/\[p:lång\]/g, " … …");

  // 2) Sätt lite fler mjuka pauser efter styckeslut
  t = t.replace(/\n{2,}/g, " …\n");

  // 3) Om meningar är långa utan komma, lägg in mjuk paus här och var
  t = t.replace(/([^\.\?\!\n]{80,200})([ \t]+)([A-ZÅÄÖ])/g, "$1, … $3");

  // 4) Rensa överdrivna blankrader
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST")   return badRequest(request, "Use POST");

  try {
    const payload = await readJson(request) || {};
    const rawText = String(payload.text || "");
    const voice   = String(payload.voice || "verse");
    const speed   = Math.max(0.85, Math.min(1.2, Number(payload.speed || 1.0)));

    if (!rawText) return badRequest(request, "Ingen text");

    const headers = openAIHeaders(env);
    if (!headers) return serverError(request, "OPENAI_API_KEY saknas");

    // För TTS skickar vi den stylade varianten
    const ttsText = stylizeForTTS(rawText);

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: ttsText,
        voice,
        speed,
        format: "wav",
        language: "sv-SE"
      })
    });

    if (!res.ok) {
      const msg = await res.text().catch(()=> "");
      return jsonResponse({ ok:false, error: msg || "TTS error" }, res.status, corsHeaders(request));
    }

    const arr = await res.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(arr)));
    const url = `data:audio/wav;base64,${b64}`;
    return jsonResponse({ ok:true, url }, 200, corsHeaders(request));
  } catch (e) {
    return serverError(request, e);
  }
}
