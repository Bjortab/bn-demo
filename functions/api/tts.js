// functions/api/tts.js
// BN TTS → ElevenLabs + sparning i R2 (BN_AUDIO)
// Returnerar MP3 direkt till klienten OCH lagrar samma MP3 i R2.

const CORS_HEADERS = (origin) => ({
  "access-control-allow-origin": origin || "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-expose-headers": "content-type",
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
});

function okJson(data, origin) {
  return new Response(JSON.stringify(data), { status: 200, headers: CORS_HEADERS(origin) });
}
function badJson(message, origin, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: CORS_HEADERS(origin),
  });
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: CORS_HEADERS(request.headers.get("Origin")) });
}

// GET ?key=<r2Key> → streama audio från R2 (bra om du vill ladda om sparade filer)
export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return badJson("Saknar 'key' i query", origin);

  try {
    const object = await env.BN_AUDIO.get(key);
    if (!object) return badJson("Hittar inte ljudfilen", origin, 404);

    const headers = new Headers({
      "access-control-allow-origin": origin || "*",
      "content-type": object.httpMetadata?.contentType || "audio/mpeg",
      "cache-control": "public, max-age=31536000, immutable",
    });
    return new Response(object.body, { status: 200, headers });
  } catch (err) {
    return badJson(`GET-fel: ${String(err)}`, origin, 500);
  }
}

// POST { text, voice? } → generera MP3 via ElevenLabs, spara till R2 och returnera MP3 direkt
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  try {
    const { text, voice } = await request.json().catch(() => ({}));
    if (!text || typeof text !== "string" || !text.trim()) {
      return badJson("Ingen text skickad till TTS.", origin);
    }

    if (!env.ELEVENLABS_API_KEY) {
      return badJson("ElevenLabs API-nyckel saknas (ELEVENLABS_API_KEY).", origin, 500);
    }

    // Röster (byt via secrets om du vill)
    const VOICE_MAP = {
      charlotte: env.ELEVEN_VOICE_CHARLOTTE || "CHARLOTTE_VOICE_ID_HERE",
      gustav: env.ELEVEN_VOICE_GUSTAV || "GUSTAV_VOICE_ID_HERE",
      alloy: "EXAVITQu4vr4xnSDxMaL", // OpenAI:s Alloy för kompat – låt stå som backup om du vill
    };

    // Voice kan vara: "charlotte" | "gustav" | direkt voiceId (36 tecken)
    let voiceId = VOICE_MAP.charlotte; // standard
    if (voice && typeof voice === "string") {
      const v = voice.toLowerCase().trim();
      voiceId = VOICE_MAP[v] || voice; // om inte namnmatch, använd som voiceId
    }

    // Trimma och begränsa text (ElevenLabs klarar långa, men praktiskt att kapa lite)
    const cleanText = text.replace(/\s+/g, " ").trim().slice(0, 5000);

    // ElevenLabs TTS call
    const body = {
      text: cleanText,
      model_id: "eleven_multilingual_v2",
      // Lite neutral/varm inställning. Kan tunas per röst senare.
      voice_settings: {
        stability: 0.52,
        similarity_boost: 0.75,
        style: 0.35,
        use_speaker_boost: true,
      },
      // Du kan skicka in `pronunciation_dictionary_locators` här senare om du vill tvinga vissa uttal
    };

    const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "content-type": "application/json",
        // Tips: "accept": "audio/mpeg" är default, men sätt explicit:
        accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    });

    if (!elRes.ok) {
      const errTxt = await elRes.text().catch(() => "");
      return badJson(`ElevenLabs-fel ${elRes.status}: ${errTxt || elRes.statusText}`, origin, 502);
    }

    const audioBuf = await elRes.arrayBuffer();

    // Spara till R2 (BN_AUDIO)
    const date = new Date();
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    const key = `v1/${yyyy}-${mm}-${dd}/${crypto.randomUUID()}.mp3`;

    await env.BN_AUDIO.put(key, audioBuf, {
      httpMetadata: { contentType: "audio/mpeg" },
    });

    // Returnera MP3 direkt (så spelaren kan spela utan extra fetch)
    const headers = new Headers({
      "access-control-allow-origin": origin || "*",
      "content-type": "audio/mpeg",
      "cache-control": "no-store",
      // bonus: skicka med var filen sparades om klienten vill spara/visa länk senare
      "x-bn-r2-key": key,
    });

    return new Response(audioBuf, { status: 200, headers });
  } catch (err) {
    return badJson(`TTS-fel: ${String(err)}`, request.headers.get("Origin"), 500);
  }
}
