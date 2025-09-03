// BN Worker v1.5 — Stable server-side mock + LIVE-ready LLM pipeline, strict responses, CORS

const ALLOWED_ORIGIN = "*"; // Lås till din Pages-domän i produktion
const VERSION = "v1.5";

const newId = () => crypto.randomUUID();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      ...extra
    }
  });
}
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    }
  });
}
function matchPath(p, target) {
  const path = p.replace(/\/+$/, "");
  const t = target.startsWith("/") ? target : `/${target}`;
  return path === t || path === `/v1${t}` || path === `/api${t}` || path === `/api/v1${t}`;
}
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function normPrompt(s) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ").slice(0, 2000);
}

/* ------------------------- Level policies & shaping ------------------------- */
const REWRITE_MAP = [
  { bad: /\b(fitta|slida)\b/gi, soft: "hennes hetta", mild: "mellan henne", explicit: "fitta" },
  { bad: /\b(kuk|lem|stake)\b/gi, soft: "min hårdhet", mild: "mig själv", explicit: "kuk" },
  { bad: /\b(slicka|slickade|slickar)\b/gi, soft: "smekte med läpparna", mild: "med munnen", explicit: "slickade" },
  { bad: /\b(knulla|knullade|knullar)\b/gi, soft: "älska", mild: "vi gav oss hän", explicit: "knullade" },
  { bad: /\b(sprut|kom|utlöst[e]?)\b/gi, soft: "topp", mild: "nådde klimax", explicit: "kom" },
];

function levelPolicy(level) {
  const L = Math.max(1, Math.min(5, Number(level || 3)));
  return {
    level: L,
    allowExplicit: L >= 4,
    moderate: L === 3,
    soften: L <= 2,
    maxWords: L <= 2 ? 700 : L === 3 ? 900 : 1200,
    style: L <= 2 ? "sensuell, suggestiv, metaforer, inga könsord"
         : L === 3 ? "sensuell+, försiktig explicit med smakfull ton"
         : L === 4 ? "het, tydlig och direkt, men estetisk"
         : "explicit och direkt, detaljerad men stilren"
  };
}

function shapeUserInputByLevel(raw, policy) {
  let text = String(raw || "");
  if (policy.allowExplicit) {
    for (const r of REWRITE_MAP) text = text.replace(r.bad, r.explicit);
    return text;
  }
  if (policy.moderate) {
    for (const r of REWRITE_MAP) text = text.replace(r.bad, r.mild);
    return text;
  }
  // L1-2
  for (const r of REWRITE_MAP) text = text.replace(r.bad, r.soft);
  return text;
}

function buildSystemPrompt(policy) {
  return [
    "Du är en skicklig svensk författare som skriver korta, fängslande erotiska berättelser.",
    "Skriv varierat, undvik upprepningar, håll naturlig rytm och flyt.",
    `Tonalitet: ${policy.style}.`,
    policy.level <= 2 ? "Undvik könsord helt. Använd antydningar och sensuella metaforer." : "",
    policy.level === 3 ? "Tillåt låg explicit nivå men håll det smakfullt och mer antydande än direkt." : "",
    policy.level >= 4 ? "Explicit språk tillåtet. Skriv direkt och utan omskrivningar, men estetiskt och respektfullt." : "",
    "Texten ska fungera för högläsning: variera meningars längd och lägg subtila pauser.",
    "Avsluta med en stark känsla eller bild och märk slutet med [SLUT].",
    policy.level >= 5 ? "Nivå 5: Skriv explicit och detaljerat om akten, utan metaforer, med raka ord och tydliga handlingar (inom regler och lag)." : "",
  ].filter(Boolean).join("\n");
}

/* -------------------------- Server-side MOCK (stable) ------------------------- */
function serverMockStory(level, promptUser, characterName = "din motspelare") {
  const p = promptUser ? `KONCEPT: ${promptUser}\n\n` : "";
  if (level >= 5) {
    // Markerar tydligt var explicit text kommer i LIVE (LLM) – ingen råtext i mock.
    return p + [
      `(Nivå 5 – explicit, LIVE kommer lägga rå text här)`,
      `[RAW_EXPLICIT_START]`,
      `...`,
      `[RAW_EXPLICIT_END]`,
      `Pulsen ökar, andetagen kortnar – inga tvivel kvar. [SLUT]`
    ].join("\n");
  }
  if (level === 4) {
    return p + [
      `(Nivå 4 – het, stilren)`,
      `Hennes rygg bågnade när min mun fann hennes hals,`,
      `min hand visste vägen, hennes svar var otvetydigt. [SLUT]`
    ].join("\n");
  }
  if (level === 3) {
    return p + [
      `(Nivå 3 – sensuell+)`,
      `Hennes andetag blev kortare när jag drog henne närmare,`,
      `min hand vilade längre än artigt, världen föll tyst. [SLUT]`
    ].join("\n");
  }
  if (level === 2) {
    return p + [
      `(Nivå 2 – antydande)`,
      `Värmen mellan oss talade först,`,
      `fingrar som dröjde, löften i skuggan av ord. [SLUT]`
    ].join("\n");
  }
  return p + [
    `(Nivå 1 – romantisk)`,
    `Våra blickar hittade hem,`,
    `allt annat tonade bort. [SLUT]`
  ].join("\n");
}

function summarizeMock(text) {
  const s = (text || "").replace(/\s+/g, " ").trim();
  const cut = s.slice(0, 450);
  const sent = cut.split(/[.!?]\s/).slice(0, 5).join(". ");
  const res = (sent || cut).trim();
  return res ? (res.endsWith(".") ? res : res + ".") : "";
}
function mergeMemory(oldSum, epSum) {
  const base = (oldSum || "").trim();
  const add  = (epSum || "").trim();
  return (base + " " + add).trim().slice(-1200);
}

/* ------------------------------- Handlers -------------------------------- */
async function handleSession(env) {
  const now = new Date().toISOString();
  const userId = newId();
  const token  = "demo-" + newId();
  try {
    if (env.DB) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO users (id, created_at, last_seen_at, locale) VALUES (?, ?, ?, ?)"
      ).bind(userId, now, now, "sv").run();
      await env.DB.prepare(
        "INSERT OR REPLACE INTO sessions (id, user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(newId(), userId, token, now, null).run();
    }
  } catch (_) {}
  return json({ user_id: userId, token, created: now });
}

async function handleCharactersCreate(request, env) {
  const body = await request.json().catch(() => ({}));
  const user_id = body.user_id;
  const name    = (body.name || "").trim();
  const profile = body.profile || {};
  const facts   = body.facts || {};
  if (!user_id || !name) return json({ error: "user_id och name krävs" }, 400);
  const id = newId(), now = new Date().toISOString();
  try {
    if (env.DB) {
      await env.DB.prepare(`
        INSERT INTO characters (id, user_id, name, profile_json, memory_summary, facts_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, user_id, name, JSON.stringify(profile), "", JSON.stringify(facts), now, now).run();
    }
  } catch (e) {
    return json({ error: "Kunde inte skapa karaktär", detail: String(e) }, 500);
  }
  return json({ character_id: id, name });
}

async function handleCharactersList(request, env) {
  const body = await request.json().catch(() => ({}));
  const user_id = body.user_id;
  if (!user_id) return json({ error: "user_id krävs" }, 400);
  let items = [];
  try {
    if (env.DB) {
      const q = await env.DB.prepare(`
        SELECT id, name, profile_json, memory_summary, facts_json, created_at, updated_at
        FROM characters
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).bind(user_id).all();
      items = q?.results || [];
    }
  } catch (_) {}
  return json({ items });
}

async function handleArcStart(request, env) {
  const body = await request.json().catch(() => ({}));
  const { user_id, character_id, title } = body;
  let level_min = Math.max(1, Math.min(5, Number(body.level_min ?? 1)));
  let level_max = Math.max(level_min, Math.min(5, Number(body.level_max ?? 5)));
  if (!user_id || !character_id || !title) return json({ error: "user_id, character_id och title krävs" }, 400);
  const id = newId(), now = new Date().toISOString();
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

async function handleEpisodesByCharacter(request, env) {
  const body = await request.json().catch(() => ({}));
  const { user_id, character_id } = body;
  const limit = Math.max(1, Math.min(50, Number(body.limit || 10)));
  if (!user_id || !character_id) return json({ error: "user_id och character_id krävs" }, 400);
  let items = [];
  try {
    if (env.DB) {
      const q = await env.DB.prepare(`
        SELECT id, arc_id, arc_step, level, lang, episode_summary, created_at
        FROM episodes
        WHERE user_id = ? AND character_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(user_id, character_id, limit).all();
      items = q?.results || [];
    }
  } catch (_) {}
  return json({ items });
}

/* ---------------------------- LLM (prepared) ---------------------------- */
/** Producerar story via LLM om MOCK=false och nycklar finns; annars null */
async function tryLLMGenerate(env, payload, policy, character, recentSummaries, memory_summary) {
  const MOCK = String(env.MOCK || "true").toLowerCase() === "true";
  if (MOCK) return null;

  // Välj provider
  const provider = (env.PROVIDER_PRIMARY || "openrouter").toLowerCase();
  const sys = buildSystemPrompt(policy);

  const contextHeader = [
    character?.name ? `KARAKTÄR: ${character.name}` : "",
    character?.profile_json ? `Profil: ${character.profile_json}` : "",
    character?.facts_json ? `Preferenser: ${character.facts_json}` : "",
    memory_summary ? `MINNE: ${memory_summary}` : "",
    recentSummaries?.length ? `SENASTE: ${recentSummaries.slice(0,3).join(" | ")}` : ""
  ].filter(Boolean).join("\n");

  const userPrompt = [
    contextHeader,
    "",
    `PROMPT: ${payload.promptUser}`,
  ].join("\n").trim();

  try {
    if (provider === "openrouter" && env.OPENROUTER_KEY) {
      const model = env.OR_MODEL || "mistralai/mixtral-8x7b-instruct"; // byt när du vill
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 1024,
          temperature: 0.9
        })
      });
      if (!r.ok) throw new Error(`OpenRouter ${r.status}`);
      const j = await r.json();
      const content = j?.choices?.[0]?.message?.content || "";
      return content || null;
    }
    // (plats för OPENAI / MISTRAL direkt-API om du vill)
  } catch (e) {
    console.warn("LLM error:", e.message || e);
    return null;
  }
}

/* --------------------------- Generate (stable) --------------------------- */
async function handleGenerate(request, env) {
  const body = await request.json().catch(() => ({}));
  const user_id      = body.user_id || null;
  const character_id = body.character_id || null;
  const arc_id       = body.arc_id || null;

  const level = Math.max(1, Math.min(5, Number(body.level || 3)));
  const lang  = (body.lang || "sv").toLowerCase();
  const words = Number(body.words || 800);
  const make_audio = !!body.make_audio;
  const voice_id = body.voice_id || null;

  if (!user_id) return json({ error: "user_id krävs" }, 400);

  const policy = levelPolicy(level);

  // Läs karaktär/minne
  let character = null, recentSummaries = [], memory_summary = "";
  try {
    if (env.DB && character_id) {
      const cq = await env.DB.prepare(`
        SELECT id, name, profile_json, memory_summary, facts_json
        FROM characters
        WHERE id = ? AND user_id = ?
      `).bind(character_id, user_id).all();
      character = (cq?.results || [])[0] || null;
      memory_summary = character?.memory_summary || "";
      const rq = await env.DB.prepare(`
        SELECT episode_summary
        FROM episodes
        WHERE user_id = ? AND character_id = ?
        ORDER BY created_at DESC
        LIMIT 5
      `).bind(user_id, character_id).all();
      recentSummaries = (rq?.results || []).map(r => r.episode_summary).filter(Boolean);
    }
  } catch (_) {}

  // Nivåstyrd omskrivning av användarinput
  const promptUserShaped = shapeUserInputByLevel(body.prompt || "", policy);
  const systemPrompt = buildSystemPrompt(policy);

  // LIVE-försök (om MOCK=false), annars null → fall back till server-mock
  const liveStory = await tryLLMGenerate(
    env,
    { promptUser: promptUserShaped },
    policy,
    character,
    recentSummaries,
    memory_summary
  );

  // Server-mock om inga LLM-svar
  const story = (liveStory && typeof liveStory === "string" && liveStory.trim().length > 0)
    ? liveStory
    : serverMockStory(level, promptUserShaped, character?.name);

  // Strict: se till att vi aldrig returnerar nivåbeskrivning som “story”
  if (!story || /^\s*(Romantisk:|Antydande sensuell:|Sensuell\+:|Het:|Explicit:)\s*/i.test(story)) {
    return json({ error: "story_generation_failed" }, 500);
  }

  const episode_summary = summarizeMock(story);
  const new_memory = mergeMemory(memory_summary, episode_summary);

  // Cache/save
  const prompt_norm = normPrompt(promptUserShaped);
  const prompt_hash = await sha256Hex(`${prompt_norm}|${lang}|${level}|${character_id || "anon"}`);

  const id = newId();
  const now = new Date().toISOString();
  let arc_step = 1;

  try {
    if (env.DB) {
      if (arc_id) {
        const stepq = await env.DB.prepare(`
          SELECT COALESCE(MAX(arc_step), 0) AS m FROM episodes
          WHERE user_id = ? AND character_id = ? AND arc_id = ?
        `).bind(user_id, character_id, arc_id).all();
        arc_step = ((stepq?.results || [])[0]?.m || 0) + 1;
      }
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
        id, user_id, body.prompt || "", prompt_norm, prompt_hash,
        lang, level, Math.min(words, policy.maxWords),
        liveStory ? "LLM" : "mock",
        liveStory ? (env.OR_MODEL || "openrouter-model") : "mock-v1.5",
        0, 0, make_audio ? "mock-tts" : null, voice_id,
        null, null, null, null,
        now, "ok", null,
        character_id, arc_id, arc_step, episode_summary
      ).run();

      // prompt_cache (best effort)
      try {
        await env.DB.prepare(`
          INSERT OR IGNORE INTO prompt_cache (
            id, prompt_norm, prompt_hash, lang, level, story_text, meta_json, hits, created_at, last_used_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `).bind(
          prompt_hash, prompt_norm, prompt_hash, lang, level,
          story,
          JSON.stringify({ provider: liveStory ? "LLM" : "mock", level, character_id, arc_id }),
          now, now
        ).run();
        await env.DB.prepare(
          "UPDATE prompt_cache SET hits = hits + 1, last_used_at = ? WHERE prompt_hash = ?"
        ).bind(now, prompt_hash).run();
      } catch (_) {}

      if (character_id) {
        await env.DB.prepare(`
          UPDATE characters
          SET memory_summary = ?, updated_at = ?
          WHERE id = ? AND user_id = ?
        `).bind(new_memory, now, character_id, user_id).run();
      }
    }
  } catch (e) {
    console.warn("D1 write error:", e);
  }

  return json({
    episode_id: id,
    character_id, arc_id, arc_step,
    level, lang,
    story,
    summary: episode_summary,
    memory_summary: new_memory,
    prompt_hash,
    tts: make_audio ? { url: null, provider: "mock-tts", voice_id } : null
  });
}

/* --------------------------------- Router -------------------------------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return handleOptions();
    try {
      if (request.method === "GET" && matchPath(url.pathname, "/status")) {
        const MOCK = String(env.MOCK || "true").toLowerCase() === "true";
        return json({
          llm: [
            { name: "OpenRouter", configured: !!env.OPENROUTER_KEY, model: env.OR_MODEL || null },
            { name: "OpenAI", configured: !!env.OPENAI_KEY, model: env.OAI_MODEL || null },
            { name: "Mistral", configured: !!env.MISTRAL_KEY, model: env.MI_MODEL || null },
          ],
          tts: [
            { name: "ElevenLabs", configured: !!env.ELEVENLABS_KEY },
            { name: "CLOUDFLARE:SPEECH", configured: false },
          ],
          flags: { MOCK },
          version: VERSION,
        });
      }
      if ((request.method === "GET" || request.method === "POST") && matchPath(url.pathname, "/session")) {
        return await handleSession(env);
      }
      if (request.method === "POST" && matchPath(url.pathname, "/characters/create")) {
        return await handleCharactersCreate(request, env);
      }
      if (request.method === "POST" && matchPath(url.pathname, "/characters/list")) {
        return await handleCharactersList(request, env);
      }
      if (request.method === "POST" && matchPath(url.pathname, "/arcs/start")) {
        return await handleArcStart(request, env);
      }
      if (request.method === "POST" && matchPath(url.pathname, "/episodes/by-character")) {
        return await handleEpisodesByCharacter(request, env);
      }
      if (request.method === "POST" && (
        matchPath(url.pathname, "/generate") ||
        matchPath(url.pathname, "/episodes/generate")
      )) {
        return await handleGenerate(request, env);
      }
      if (request.method === "GET" && matchPath(url.pathname, "/health")) {
        return json({ ok: true, time: Date.now(), service: "bn-worker" });
      }
      return json({ error: "Not found", path: url.pathname }, 404);
    } catch (err) {
      return json({ error: err?.message || "Internal error" }, 500);
    }
  }
};
