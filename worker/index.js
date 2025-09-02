// [rad ~1] BN Worker v1.0.1 — mock + D1 writes + CORS

// [rad ~5] CORS-config (lås ev. till din Pages-domän)
const ALLOWED_ORIGIN = "*"; // t.ex. "https://bn-demo01.pages.dev"

// [rad ~9] Hjälpare: standard JSON-svar med CORS
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      ...extraHeaders,
    },
  });
}

// [rad ~20] Hjälpare: OPTIONS / preflight
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// [rad ~34] Hjälpare: ULID-ish/UUID (enkelt nog för mock)
function newId() {
  return crypto.randomUUID();
}

// [rad ~39] Hjälpare: SHA-256 (för prompt-hash)
async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// [rad ~47] Normalisering av prompt (väldigt enkel)
function normPrompt(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 2000);
}

export default {
  // [rad ~54] Huvudhandler
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // [rad ~58] CORS preflight
    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    try {
      // [rad ~64] Öppna endpoints
      if (url.pathname === "/api/v1/status" && request.method === "GET") {
        return json({
          llm: [
            { name: "OpenRouter", healthy: false, models: [] },
            { name: "Mistral", healthy: false },
            { name: "OpenAI", healthy: false }
          ],
          tts: [
            { name: "ElevenLabs", healthy: false, tier: "EL" },
            { name: "CLOUDFLARE:SPEECH", healthy: true, tier: "BASIC" }
          ],
          version: "v1.0.1",
          mock: true
        });
      }

      if (url.pathname === "/api/v1/health" && request.method === "GET") {
        return json({ ok: true, service: "bn-worker" });
      }

      // [rad ~83] Skapa mock-session (POST)
      if (url.pathname === "/api/v1/session" && request.method === "POST") {
        const now = new Date().toISOString();
        const userId = newId();
        const token = "demo-" + newId();

        // Försök skriva till D1 (om kopplad). Misslyckas tyst om D1 saknas.
        try {
          if (env.DB) {
            await env.DB.prepare(
              "INSERT OR IGNORE INTO users (id, created_at, last_seen_at, locale) VALUES (?, ?, ?, ?)"
            ).bind(userId, now, now, "sv").run();

            await env.DB.prepare(
              "INSERT OR REPLACE INTO sessions (id, user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
            ).bind(newId(), userId, token, now, null).run();
          }
        } catch (e) {
          // logga men returnera ändå mock-session
          console.warn("D1 session write failed:", e);
        }

        return json({ user_id: userId, token, created: now });
      }

      // [rad ~108] Generera (mock) + spara episode + cache
      if (url.pathname === "/api/v1/generate" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const promptRaw = body.prompt || "";
        const level = Math.max(1, Math.min(5, Number(body.level || 3)));
        const lang = (body.lang || "sv").toLowerCase();
        const words = Number(body.words || 800);
        const voiceId = body.voice_id || null;
        const makeAudio = !!body.make_audio;

        // [rad ~118] Mockad text (ersätts av riktig LLM senare)
        const story = [
          `TL;DR: En het scen byggs upp. (nivå ${level}, ${lang})`,
          "",
          `Berättelse:`,
          `Du skrev: "${promptRaw}".`,
          `Detta är en mockad text tills vi kopplar in LLM.`
        ].join("\n");

        // [rad ~126] Prompt-hash för cache
        const norm = normPrompt(promptRaw);
        const pHash = await sha256Hex(`${norm}|${lang}|${level}`);

        const episodeId = newId();
        const now = new Date().toISOString();

        // [rad ~132] Försök spara i D1 (episode + cache)
        try {
          if (env.DB) {
            // episodes
            await env.DB.prepare(`
              INSERT INTO episodes (
                id, user_id, prompt_raw, prompt_norm, prompt_hash,
                lang, level, words, provider, model,
                cost_tokens, cost_credits, tts_provider, voice_id,
                r2_key_story, r2_key_audio, story_url, audio_url,
                created_at, status, err
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              episodeId,
              body.user_id || null,            // om frontend skickar user_id
              promptRaw,
              norm,
              pHash,
              lang,
              level,
              words,
              "mock",
              "mock-v1",
              0,
              0,
              makeAudio ? "mock-tts" : null,
              voiceId,
              null, null, null, null,
              now,
              "ok",
              null
            ).run();

            // prompt_cache – upsert/hits++
            await env.DB.prepare(`
              INSERT OR IGNORE INTO prompt_cache (
                id, prompt_norm, prompt_hash, lang, level, story_text, meta_json, hits, created_at, last_used_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            `).bind(
              pHash, norm, pHash, lang, level, story, JSON.stringify({ provider: "mock", model: "mock-v1" }),
              now, now
            ).run();

            await env.DB.prepare(
              "UPDATE prompt_cache SET hits = hits + 1, last_used_at = ? WHERE prompt_hash = ?"
            ).bind(now, pHash).run();
          }
        } catch (e) {
          console.warn("D1 episode/cache write failed:", e);
        }

        // [rad ~176] Svar till frontend
        return json({
          episode_id: episodeId,
          prompt_hash: pHash,
          story,
          tts: makeAudio ? { url: null, provider: "mock-tts", voice_id: voiceId } : null
        });
      }

      // [rad ~187] Fallback 404
      return json({ error: "Not found" }, 404);
    } catch (err) {
      // [rad ~191] Global 500
      return json({ error: err?.message || "Internal error" }, 500);
    }
  },
};
