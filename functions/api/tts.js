// functions/api/tts.js — GC v4 (ElevenLabs-first, tempo, clean, cache, CORS)
import { corsHeaders, jsonResponse, serverError, sha256 } from "./_utils.js";

// 1) Mappa UI-val -> riktiga ElevenLabs voice_id
//    BYT TILL DINA RIKTIGA ID:N
const DEFAULT_VOICES = {
  female: "ELEVEN_VOICE_ID_FEMALE",   // ex: "21m00Tcm4TlvDq8ikWAM"
  male:   "ELEVEN_VOICE_ID_MALE",     // ex: "TxGEqnHWrfWFTfGW9XjX"
  neutral:"ELEVEN_VOICE_ID_NEUTRAL"   // valfri tredje röst
};

// 2) Enkla saneringsregler (minskar censur/upprepningar i TTS)
const MAX_CHARS = 4000;
const STRIP_RE = /[\u0000-\u001F]+/g;

// 3) OPTIONS (CORS preflight)
export async function onRequestOptions({ request }) {
  return new Response("", { status: 204, headers: corsHeaders(request) });
}

// 4) GET för enkel hälsa (debug)
export async function onRequestGet({ request }) {
  return new Response("tts: ok", { status: 200, headers: corsHeaders(request) });
}

// 5) POST: text -> mp3 (ElevenLabs)
export async function onRequestPost({ request, env }) {
  try {
    const { text, voice = "neutral", tempo = "normal" } = await request.json();

    if (!text || typeof text !== "string") {
      return jsonResponse({ ok: false, error: "Ingen text till TTS." }, 400, request);
    }
    if (!env.ELEVENLABS_API_KEY) {
      return jsonResponse({ ok: false, error: "Saknar ELEVENLABS_API_KEY." }, 500, request);
    }

    // 5a) Clean + begränsa längd
    let clean = text.replace(STRIP_RE, "").trim();
    if (clean.length > MAX_CHARS) clean = clean.slice(0, MAX_CHARS);

    // 5b) Välj voice_id
    const pick = (voice || "neutral").toLowerCase();
    const voiceId = DEFAULT_VOICES[pick] || DEFAULT_VOICES.neutral;

    // 5c) Tempo → playback speed (ElevenLabs stöder inte “speed” direkt,
    //     men vi kan styra stilparametrar för att ge snabbare/långsammare intryck)
    //     Här väljer vi “style” och “stability” så att slow -> mjukare, fast -> mer punch.
    let stability = 0.55;
    let style = 0.4;
    if (tempo === "slow") { stability = 0.7; style = 0.2; }
    if (tempo === "fast") { stability = 0.45; style = 0.65; }

    // 5d) Cache-nyckel (om du senare vill mappa mot KV/R2)
    const key = await sha256(`${voiceId}::${stability}::${style}::${clean}`);

    // === KV-cache (om du kopplat env.BN_AUDIO) ===
    // if (env.BN_AUDIO) {
    //   const hit = await env.BN_AUDIO.get(key, "arrayBuffer");
    //   if (hit) {
    //     return new Response(hit, {
    //       status: 200,
    //       headers: {
    //         ...corsHeaders(request),
    //         "Content-Type": "audio/mpeg",
    //         "Cache-Control": "public, max-age=31536000, immutable",
    //         "ETag": `"${key}"`
    //       }
    //     });
    //   }
    // }

    // 5e) ElevenLabs TTS-anrop
    // Docs: https://api.elevenlabs.io
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const body = {
      text: clean,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability,
        similarity_boost: 0.8,
        style,
        use_speaker_boost: true
      },
      // output-format i v2 sätts via Accept
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        // önskat format 128kbps mp3
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      // Försök läsa fel från ElevenLabs
      const maybeErr = await res.text().catch(() => "");
      return jsonResponse(
        { ok: false, error: `ElevenLabs fel ${res.status}`, detail: maybeErr?.slice(0, 300) || "" },
        res.status,
        request
      );
    }

    const audioBuf = await res.arrayBuffer();

    // === Spara i KV (om aktiverat) ===
    // if (env.BN_AUDIO) {
    //   await env.BN_AUDIO.put(key, audioBuf, { expirationTtl: 60 * 60 * 24 * 30 }); // 30 dagar
    // }

    return new Response(audioBuf, {
      status: 200,
      headers: {
        ...corsHeaders(request),
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuf.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });

  } catch (err) {
    return serverError(err, request);
  }
}
