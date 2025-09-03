// BN Worker v1.1 — Characters + Memory + Arcs (mock), CORS, robust routes
// Kör billigt i mock-läge (inga externa API:er). Skrivningar görs till D1 om env.DB finns.

const ALLOWED_ORIGIN = "*"; // sätt till din Pages-domän när du vill låsa ner

/* ------------------------------- Helpers -------------------------------- */

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      ...extra,
    },
  });
}

function noContent() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    },
  });
}

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

function newId() {
  return crypto.randomUUID();
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function normPrompt(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 2000);
}

// Flexibel path-match: stödjer /x, /v1/x, /api/v1/x
function matchPath(urlPath, target) {
  const p = urlPath.replace(/\/+$/, "");
  const t = target.startsWith("/") ? target : `/${target}`;
  return (
    p === t ||
    p === `/v1${t}` ||
    p === `/api${t}` ||
    p === `/api/v1${t}`
  );
}

// Liten “sammanfattare” (mock) – klipper ner text till 3–6 meningar max 450 tecken.
function mockSummarize(text) {
  const plain = String(text || "").replace(/\s+/g, " ").trim();
  const cut = plain.slice(0, 450);
  const parts = cut.split(/[.!?]\s/).slice(0, 5);
  const res = parts.join(". ").trim();
  return res ? (res.endsWith(".") ? res : res + ".") : cut;
}

// Uppdaterar memory_summary genom att “komprimera” gammalt + nytt (mock)
function mockUpdateMemory(oldSummary, newEpisodeSummary) {
  const base = (oldSummary || "").trim();
  const add = (newEpisodeSummary || "").trim();
  const joined = (base ? base + " " : "") + add;
  // enkel “komprimering”: behåll sista ~1200 tecken
  return joined.slice(-1200);
}

/* ----------------------------- Request Handler -------------------------- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") return handleOptions();

    try {
      /* --------------------------- Public endpoints --------------------------- */
      if (request.method === "GET" && matchPath(url.pathname, "/status")) {
        return json({
          llm: [
            { name: "OpenRouter", healthy: false, models: [] },
            { name: "Mistral", healthy: false },
            { name: "OpenAI", healthy: false },
          ],
          tts: [
            { name: "ElevenLabs", healthy: false, tier: "EL" },
            { name: "CLOUDFLARE:SPEECH", healthy: true, tier: "BASIC" },
          ],
          version: "v1.1",
          mock: true,
        });
      }

      if (request.method === "GET" && matchPath(url.pathname, "/health")) {
        return json({ ok: true, service: "bn-worker", time: Date.now() });
      }

      /* ------------------------------ Session -------------------------------- */
      if ((request.method === "POST" || request.method === "GET") &&
          matchPath(url.pathname, "/session")) {
        const now = new Date().toISOString();
        const userId = newId();
        const token = "demo-" + newId();
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
          console.warn("D1 session write failed:", e);
        }
        return json({ user_id: userId, token, created: now });
      }

      /* ---------------------------- Characters -------------------------------- */
      if (request.method === "POST" && matchPath(url.pathname, "/characters/create")) {
        const body = await request.json().catch(() => ({}));
        const user_id = body.user_id || null;
        const name = (body.name || "").trim();
        const profile = body.profile || {};
        const facts = body.facts || {};

        if (!user_id || !name) return json({ error: "user_id och name krävs" }, 400);

        const id = newId();
        const now = new Date().toISOString();
        try {
          if (env.DB) {
            await env.DB.prepare(`
              INSERT INTO characters (id, user_id, name, profile_json, memory_summary, facts_json, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              id, user_id, name,
              JSON.stringify(profile),
              "", // tomt minne från start
              JSON.stringify(facts),
              now, now
            ).run();
          }
        } catch (e) {
          // Om unikt namn per user bryts → returnera fel
          return json({ error: "Kunde inte skapa karaktär", detail: String(e) }, 500);
        }
        return json({ character_id: id, name });
      }

      if (request.method === "POST" && matchPath(url.pathname, "/characters/list")) {
        const body = await request.json().catch(() => ({}));
        const user_id = body.user_id || null;
        if (!user_id) return json({ error: "user_id krävs" }, 400);

        let rows = [];
        try {
          if (env.DB) {
            const q = await env.DB.prepare(`
              SELECT id, name, profile_json, memory_summary, facts_json, created_at, updated_at
              FROM characters
              WHERE user_id = ?
              ORDER BY created_at DESC
            `).bind(user_id).all();
            rows = q?.results || [];
          }
        } catch (e) {
          console.warn("D1 list characters failed:", e);
        }
        return json({ items: rows });
      }

      /* ------------------------------- Arcs ---------------------------------- */
      if (request.method === "POST" && matchPath(url.pathname, "/arcs/start")) {
        const body = await request.json().catch(() => ({}));
        const { user_id, character_id, title } = body;
        const level_min = Math.max(1, Math.min(5, Number(body.level_min ?? 1)));
        const level_max = Math.max(level_min, Math.min(5, Number(body.level_max ?? 5)));
        if (!user_id || !character_id || !title) {
          return json({ error: "user_id, character_id och title krävs" }, 400);
        }

        const id = newId();
        const now = new Date().toISOString();
        try {
          if (env.DB) {
            await env.DB.prepare(`
              INSERT INTO story_arcs (id, user_id, character_id, title, status, level_min, level_max, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
            `).bind(id, user_id, character_id, title, level_min, level_max, now, now).run();
          }
        } catch (e) {
          return json({ error: "Kunde inte skapa arc", detail: String(e) }, 500);
        }
        return json({ arc_id: id, next_step: 1 });
      }

      if (request.method === "POST" && matchPath(url.pathname, "/arcs/list")) {
        const body = await request.json().catch(() => ({}));
        const { user_id, character_id, status } = body;
        if (!user_id) return json({ error: "user_id krävs" }, 400);

        let rows = [];
        try {
          if (env.DB) {
            let sql = `
              SELECT id, character_id, title, status, level_min, level_max, created_at, updated_at
              FROM story_arcs
              WHERE user_id = ?
            `;
            const params = [user_id];
            if (character_id) { sql += " AND character_id = ?"; params.push(character_id); }
            if (status) { sql += " AND status = ?"; params.push(status); }
            sql += " ORDER BY created_at DESC";
            const q = await env.DB.prepare(sql).bind(...params).all();
            rows = q?.results || [];
          }
        } catch (e) {
          console.warn("D1 list arcs failed:", e);
        }
        return json({ items: rows });
      }

      /* ---------------------- Episodes by character -------------------------- */
      if (request.method === "POST" && matchPath(url.pathname, "/episodes/by-character")) {
        const body = await request.json().catch(() => ({}));
        const { user_id, character_id, limit } = body;
        if (!user_id || !character_id) return json({ error: "user_id och character_id krävs" }, 400);

        const LIM = Math.max(1, Math.min(50, Number(limit || 10)));
        let rows = [];
        try {
          if (env.DB) {
            const q = await env.DB.prepare(`
              SELECT id, arc_id, arc_step, level, lang, episode_summary, created_at
              FROM episodes
              WHERE user_id = ? AND character_id = ?
              ORDER BY created_at DESC
              LIMIT ?
            `).bind(user_id, character_id, LIM).all();
            rows = q?.results || [];
          }
        } catch (e) {
          console.warn("D1 episodes by character failed:", e);
        }
        return json({ items: rows });
      }

      /* ------------------------------- Generate ------------------------------ */
      if (request.method === "POST" && matchPath(url.pathname, "/generate")) {
        const body = await request.json().catch(() => ({}));
        const user_id = body.user_id || null;
        const character_id = body.character_id || null;
        const arc_id = body.arc_id || null;

        const promptRaw = body.prompt || "";
        const level = Math.max(1, Math.min(5, Number(body.level || 3)));
        const lang = (body.lang || "sv").toLowerCase();
        const words = Number(body.words || 800);
        const voiceId = body.voice_id || null;
        const makeAudio = !!body.make_audio;

        if (!user_id) return json({ error: "user_id krävs" }, 400);

        // Hämta karaktär + minne + senaste summaries (mockad återhämtning)
        let character = null;
        let arc = null;
        let recentSummaries = [];
        try {
          if (env.DB && character_id) {
            const cq = await env.DB.prepare(`
              SELECT id, name, profile_json, memory_summary, facts_json
              FROM characters
              WHERE id = ? AND user_id = ?
            `).bind(character_id, user_id).all();
            character = (cq?.results || [])[0] || null;

            if (arc_id) {
              const aq = await env.DB.prepare(`
                SELECT id, title, status, level_min, level_max
                FROM story_arcs
                WHERE id = ? AND user_id = ? AND character_id = ?
              `).bind(arc_id, user_id, character_id).all();
              arc = (aq?.results || [])[0] || null;
            }

            const rq = await env.DB.prepare(`
              SELECT episode_summary
              FROM episodes
              WHERE user_id = ? AND character_id = ?
              ORDER BY created_at DESC
              LIMIT 5
            `).bind(user_id, character_id).all();
            recentSummaries = (rq?.results || []).map(r => r.episode_summary).filter(Boolean);
          }
        } catch (e) {
          console.warn("D1 read character/arc failed:", e);
        }

        // Bygg “kontekst” (mock istället för LLM)
        const profile = character?.profile_json ? JSON.parse(character.profile_json) : {};
        const facts = character?.facts_json ? JSON.parse(character.facts_json) : {};
        const memory_summary = character?.memory_summary || "";

        const contextHeader = [
          `KARAKTÄR: ${character?.name || "(okänd)"} `,
          `Profil: ${JSON.stringify(profile)}`,
          `Preferenser: ${JSON.stringify(facts)}`,
          `MINNE: ${memory_summary || "(tomt)"}`,
          `SENASTE: ${recentSummaries.filter(Boolean).slice(0, 3).join(" | ") || "(—)"}`
        ].join("\n");

        // Mockad berättelse (ersätts senare med riktig LLM)
        const story = [
          `TL;DR: Fortsättning (nivå ${level}, ${lang}).`,
          "",
          contextHeader,
          "",
          `PROMPT: ${promptRaw}`,
          "",
          `BERÄTTELSE (mock):`,
          `Ni tar nästa steg i er historia. Den här texten är mockad tills LLM kopplas in.`,
          "[SLUT]"
        ].join("\n");

        // Skapa summary för episoden och uppdatera minnet (mock)
        const episode_summary = mockSummarize(story);
        const new_memory = mockUpdateMemory(memory_summary, episode_summary);

        const norm = normPrompt(promptRaw);
        const pHash = await sha256Hex(`${norm}|${lang}|${level}|${character_id || "anon"}`);

        const episodeId = newId();
        const now = new Date().toISOString();
        let nextArcStep = 1;

        try {
          if (env.DB) {
            // Bestäm arc_step = 1 + max(step) i befintlig arc (om finns)
            if (arc_id) {
              const stepq = await env.DB.prepare(`
                SELECT COALESCE(MAX(arc_step), 0) AS m FROM episodes
                WHERE user_id = ? AND character_id = ? AND arc_id = ?
              `).bind(user_id, character_id, arc_id).all();
              nextArcStep = ((stepq?.results || [])[0]?.m || 0) + 1;
            }

            // Spara episod
            await env.DB.prepare(`
              INSERT INTO episodes (
                id, user_id, prompt_raw, prompt_norm, prompt_hash,
                lang, level, words, provider, model,
                cost_tokens, cost_credits, tts_provider, voice_id,
                r2_key_story, r2_key_audio, story_url, audio_url,
                created_at, status, err,
                character_id, arc_id, arc_step, episode_summary
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              episodeId, user_id, promptRaw, norm, pHash,
              lang, level, words, "mock", "mock-v1",
              0, 0, makeAudio ? "mock-tts" : null, voiceId,
              null, null, null, null,
              now, "ok", null,
              character_id, arc_id, nextArcStep, episode_summary
            ).run();

            // Uppdatera prompt_cache (enkel upsert)
            await env.DB.prepare(`
              INSERT OR IGNORE INTO prompt_cache (
                id, prompt_norm, prompt_hash, lang, level, story_text, meta_json, hits, created_at, last_used_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            `).bind(
              pHash, norm, pHash, lang, level,
              story,
              JSON.stringify({ provider: "mock", model: "mock-v1", character_id, arc_id }),
              now, now
            ).run();
            await env.DB.prepare(
              "UPDATE prompt_cache SET hits = hits + 1, last_used_at = ? WHERE prompt_hash = ?"
            ).bind(now, pHash).run();

            // Uppdatera karaktärens minne
            if (character_id) {
              await env.DB.prepare(`
                UPDATE characters
                SET memory_summary = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
              `).bind(new_memory, now, character_id, user_id).run();
            }
          }
        } catch (e) {
          console.warn("D1 writes in /generate failed:", e);
        }

        return json({
          episode_id: episodeId,
          character_id,
          arc_id,
          arc_step: nextArcStep,
          prompt_hash: pHash,
          story,
          summary: episode_summary,
          memory_summary: new_memory,
          tts: makeAudio ? { url: null, provider: "mock-tts", voice_id: voiceId } : null,
        });
      }

      /* -------------------------------- 404 ---------------------------------- */
      return json({ error: "Not found", path: url.pathname }, 404);

    } catch (err) {
      return json({ error: err?.message || "Internal error" }, 500);
    }
  },
};
