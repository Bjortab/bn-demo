// worker/index.js
import { assertWithinBudgetOrThrow, addUsage, readUsage } from "./budget-guard.js";

/**
 * Utility: JSON-respons med CORS
 */
function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-max-age": "86400",
    },
  });
}

/**
 * Utility: CORS preflight
 */
function handleOptions(origin = "*") {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-max-age": "86400",
    },
  });
}

/**
 * Utility: säkert parse av JSON-body
 */
async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/**
 * Utility: enkel hash för cache-nycklar
 */
async function sha256(input) {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * ElevenLabs TTS-anrop – returnerar ArrayBuffer med MP3
 */
async function elevenTTS(text, env, voiceId) {
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }
  const voice = voiceId || env.ELEVENLABS_VOICE_ID || "Rachel";
  const modelId = "eleven_multilingual_v2";

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      optimize_streaming_latency: 0,
      output_format: "mp3_44100_128",
    }),
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    throw new Error(`ElevenLabs error ${res.status}: ${errTxt}`);
  }
  return await res.arrayBuffer();
}

/**
 * D1 helpers (anpassad till din stil i skärmdumpen)
 */
async function ensureUser(env, userId) {
  // Finns user redan?
  const q = env.DB.prepare("SELECT id FROM users WHERE id = ? LIMIT 1").bind(userId);
  const row = await q.first();
  if (!row) {
    await env.DB.prepare("INSERT INTO users (id, created_at) VALUES (?, datetime('now'))").bind(userId).run();
  }
}
async function insertCharacter(env, userId, name) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO characters (id, user_id, name, created_at) VALUES (?, ?, ?, datetime('now'))"
  ).bind(id, userId, name).run();
  return id;
}

/**
 * R2 helpers
 */
async function r2Get(env, key) {
  return env.BN_AUDIO.get(key);
}
async function r2Put(env, key, data, contentType = "audio/mpeg") {
  return env.BN_AUDIO.put(key, data, {
    httpMetadata: { contentType },
  });
}

export default {
  /**
   * Huvudhandler
   */
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const { pathname, searchParams } = url;
    const method = req.method.toUpperCase();
    const origin = env.BN_ALLOWED_ORIGIN || "*";

    // CORS preflight
    if (method === "OPTIONS") {
      return handleOptions(origin);
    }

    // ---- POST /api/v1/characters/create  (matchar din skärmdump) ----
    if (pathname === "/api/v1/characters/create" && method === "POST") {
      const body = await readJson(req);
      const name = body?.name || body?.user_id || null; // i din kod använde du name från body
      const user_id = body?.user_id || crypto.randomUUID(); // fallback om klient inte skickar user
      if (!name) return json({ error: "name required" }, 400, origin);

      // säkerställ user
      await ensureUser(env, user_id);

      // skapa character
      const character_id = await insertCharacter(env, user_id, name);

      return json({ ok: true, user_id, character_id, name }, 200, origin);
    }

    // ---- GET /admin/tts-usage  (budgetöversikt) ----
    if (pathname === "/admin/tts-usage" && method === "GET") {
      const data = await readUsage(env);
      // runda kronor för visning
      data.sek_spent_est = Math.round(data.sek_spent_est);
      return json(data, 200, origin);
    }

    // ---- POST /api/tts/generate  (alias: /api/v1/tts) ----
    if (
      (pathname === "/api/tts/generate" || pathname === "/api/v1/tts") &&
      method === "POST"
    ) {
      const body = await readJson(req);
      if (!body || typeof body.text !== "string" || body.text.trim().length === 0) {
        return json({ error: "text required" }, 400, origin);
      }
      const text = body.text.trim();
      const voice = body.voice || env.ELEVENLABS_VOICE_ID || "Rachel";

      // Cache-nyckel: voice + hash(text)
      const key = `tts/${voice}/${await sha256(text)}.mp3`;

      // 1) cacheträff → returnera fil direkt (ingen kostnad, ingen budgeträkning)
      const cached = await r2Get(env, key);
      if (cached) {
        return new Response(cached.body, {
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
            "cache-control": "public, max-age=31536000, immutable",
            "access-control-allow-origin": origin,
          },
        });
      }

      // 2) budgetspärr före anrop till ElevenLabs (räknar bara missar)
      const chars = text.length;
      await assertWithinBudgetOrThrow(env, chars);

      // 3) generera via ElevenLabs
      let audioBuf;
      try {
        audioBuf = await elevenTTS(text, env, voice);
      } catch (e) {
        return json({ error: "tts_failed", detail: String(e) }, 502, origin);
      }

      // 4) spara i R2 (cache)
      try {
        await r2Put(env, key, audioBuf, "audio/mpeg");
      } catch (e) {
        // om lagring misslyckas, leverera ändå ljudet – men logga fel
        console.warn("R2 put failed:", e);
      }

      // 5) registrera faktisk förbrukning
      try {
        await addUsage(env, chars);
      } catch (e) {
        console.warn("KV addUsage failed:", e);
      }

      // 6) returnera MP3 direkt (ingen publik URL krävs)
      return new Response(audioBuf, {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "access-control-allow-origin": origin,
        },
      });
    }

    // ---- Healthcheck / status (behåll enkel) ----
    if (pathname === "/health" && method === "GET") {
      return json({ ok: true, service: "BN Worker", time: new Date().toISOString() }, 200, origin);
    }

    // Fallback 404
    return json({ error: "not_found", path: pathname }, 404, origin);
  },
};
