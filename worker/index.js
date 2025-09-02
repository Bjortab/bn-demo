/**
 * BN 0.4 Worker – D1 + KV + R2
 * - Tokens (credits) med holds/capture/refund
 * - Cache/mallar (archetype) + R2-lagring
 * - Karaktärer & episoder
 * - Idempotens
 * - Mock-läge (BN_MOCK_PROVIDERS=1) för torrkörning
 *
 * Säkerhet: signerade R2-URL:er, enkel CORS, server-side validering.
 */

export default {
  async fetch(req, env, ctx) {
    try {
      const url = new URL(req.url);
      if (req.method === "OPTIONS") return cors();
      const originOk = env.BN_ALLOWED_ORIGIN ?? "*";
      // Basic router
      const path = url.pathname.replace(/\/+$/, "");
      const method = req.method;

      // Attach context
      const ctxObj = { env, req, url };

      // Public endpoints
      if (method === "GET" && path === "/api/v1/status") return status(ctxObj);
      if (method === "POST" && path === "/api/v1/auth/anonymous") return authAnonymous(ctxObj);

      // Auth (simple bearer from body or header)
      const user = await requireUser(ctxObj);
      if (!user.ok) return json(401, err("AUTH_REQUIRED", user.message));

      // Credits
      if (method === "GET" && path === "/api/v1/credits/balance") return creditsBalance(ctxObj, user.id);
      if (method === "POST" && path === "/api/v1/credits/quote") return creditsQuote(ctxObj, user.id);
      if (method === "POST" && path === "/api/v1/credits/hold") return creditsHold(ctxObj, user.id);

      // Generate
      if (method === "POST" && path === "/api/v1/generate") return generate(ctxObj, user.id);

      // Characters
      if (method === "POST" && path === "/api/v1/characters") return createCharacter(ctxObj, user.id);
      if (method === "GET" && path === "/api/v1/characters") return listCharacters(ctxObj, user.id);

      // Episodes
      if (method === "GET" && path === "/api/v1/episodes") return listEpisodes(ctxObj, user.id);

      // Cache check (optional)
      if (method === "POST" && path === "/api/v1/cache/check") return cacheCheck(ctxObj, user.id);

      // Payments (stub)
      if (method === "POST" && path === "/api/v1/payments/ccbill/session") return paymentsSessionStub(ctxObj, user.id);
      if (method === "POST" && path === "/api/v1/payments/ccbill/webhook") return paymentsWebhookStub(ctxObj);

      return json(404, err("NOT_FOUND", "Endpoint saknas"));
    } catch (e) {
      return json(500, err("SERVER_ERROR", e?.message || "Okänt fel"));
    }
  }
};

/* ---------- Helpers ---------- */
const cors = () => new Response("", {
  status: 204,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Idempotency-Key"
  }
});
const json = (status, data) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  }
});
const ok = (data) => ({ ok: true, ...data });
const err = (code, message, details = {}) => ({ error: { code, message, details } });
const now = () => Date.now();
const uuid = () => crypto.randomUUID();
async function sha512(str) {
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-512", buf);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function readJson(req) {
  try { return await req.json(); } catch { return {}; }
}
function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/* ---------- Status ---------- */
async function status({ env }) {
  const mock = env.BN_MOCK_PROVIDERS === "1";
  return json(200, {
    providers: [
      { name: "OpenRouter", healthy: !mock, models: mock ? [] : ["provider-model-placeholder"] },
      { name: "Mistral", healthy: !mock },
      { name: "OpenAI", healthy: !mock }
    ],
    tts: [
      { name: "ElevenLabs", healthy: !mock, tier: "EL" },
      { name: "BasicTTS", healthy: true, tier: "BASIC" }
    ],
    version: "v1.0.0",
    mock
  });
}

/* ---------- Auth ---------- */
async function authAnonymous({ env }) {
  const id = uuid();
  await env.DB.prepare(
    "INSERT INTO users (id,email,created_at) VALUES (?1,NULL,?2)"
  ).bind(id, now()).run();
  // En liten startbonus så UI känns kul
  await ledgerAdd(env, id, +200, "TOPUP", "signup_bonus");
  const token = `anon:${id}`;
  return json(200, { user_id: id, token, created_at: now() });
}

async function requireUser({ req, env }) {
  const hdr = req.headers.get("Authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token || !token.startsWith("anon:")) return { ok: false, message: "Saknar eller ogiltig token" };
  const id = token.split(":")[1];
  const row = await env.DB.prepare("SELECT id FROM users WHERE id=?1").bind(id).first();
  if (!row) return { ok: false, message: "Okänd användare" };
  return { ok: true, id };
}

/* ---------- Credits ---------- */
async function creditsBalance({ env }, userId) {
  const total = await env.DB.prepare("SELECT COALESCE(SUM(delta),0) as bal FROM credit_ledger WHERE user_id=?1")
    .bind(userId).first();
  const holds = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) as h FROM credit_holds WHERE user_id=?1 AND status='HELD' AND expires_at > ?2")
    .bind(userId, now()).first();
  const balance = total?.bal || 0;
  const held = holds?.h || 0;
  return json(200, { balance, holds: held, available: balance - held, updated_at: now() });
}

function wordsToCredits(level, words) {
  const per = 350;
  const blocks = Math.max(1, Math.ceil(words / per));
  if (level <= 3) return 1 * blocks;
  if (level === 4) return 2 * blocks;
  return 3 * blocks; // level 5
}
function ttsToCredits(tier, seconds) {
  const per = 30;
  const blocks = Math.max(1, Math.ceil(seconds / per));
  return tier === "EL" ? 1 * blocks : 0.5 * blocks;
}

function normalizePrompt(p) {
  const s = (p || "").toLowerCase().trim();
  // väldigt enkel normalisering (kan bytas mot bättre)
  return s
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
}
function detectArchetype(norm) {
  if (norm.includes("granne")) return "heta_grannen";
  if (norm.includes("chef")) return "chef";
  if (norm.includes("hotel")) return "hotellet";
  if (norm.includes("pt") || norm.includes("personlig tränare")) return "pt";
  return "fri_fantasi";
}

async function creditsQuote({ req, env }, userId) {
  const body = await readJson(req);
  const {
    mode = "NEW",
    level = 1,
    lang = env.BN_DEFAULT_LANG || "sv",
    voice_preset = "basic:female",
    words_target = parseInt(env.BN_DEFAULT_WORDS || "800", 10),
    tts = { enabled: false, tier: "BASIC" },
    character_id = null,
    prompt = ""
  } = body;

  const norm = normalizePrompt(prompt);
  const arch = detectArchetype(norm);

  // enkel cacheheuristik
  const cacheKey = await buildCacheKey(arch, level, lang, voice_preset);
  const cacheRow = await env.DB.prepare("SELECT key FROM cache_entries WHERE key=?1").bind(cacheKey).first();
  const cacheHit = !!cacheRow;

  // fortsättning → rabatt
  const continueDiscount = mode === "CONTINUE" ? 0.3 : 0.0;
  let textCredits = wordsToCredits(level, words_target);
  let ttsCredits = 0;

  if (tts?.enabled) {
    const seconds = Math.round(words_target / 2.6); // ~ 2.6 w/s
    ttsCredits = ttsToCredits(tts.tier === "EL" ? "EL" : "BASIC", seconds);
  }

  let total = textCredits + ttsCredits;
  if (cacheHit) total = Math.ceil(total * 0.5); // 50% vid cacheträff
  if (continueDiscount > 0) total = Math.ceil(total * (1 - continueDiscount));

  const quoteId = "q_" + uuid();
  const res = {
    quote_id: quoteId,
    breakdown: {
      text_credits: textCredits,
      tts_credits: ttsCredits,
      cache_discount: cacheHit ? 1 : 0,
      continue_discount: continueDiscount
    },
    total_credits: total,
    cache_hit: cacheHit,
    archetype_key: arch,
    notes: cacheHit ? "Cacheträff (50%)" : "Ingen cacheträff"
  };
  // spara quote i KV för 15 min
  await env.KV.put(`quote:${userId}:${quoteId}`, JSON.stringify({ ...res, user_id: userId, created_at: now(), words_target, level, lang, voice_preset, arch, tts, prompt, mode }), { expirationTtl: 15 * 60 });
  return json(200, res);
}

async function creditsHold({ req, env }, userId) {
  const body = await readJson(req);
  const { quote_id } = body || {};
  if (!quote_id) return json(400, err("BAD_REQUEST", "Saknar quote_id"));
  const qraw = await env.KV.get(`quote:${userId}:${quote_id}`);
  if (!qraw) return json(400, err("QUOTE_EXPIRED", "Offerten har löpt ut"));
  const quote = JSON.parse(qraw);
  const holdAmount = Math.ceil(quote.total_credits * 1.1);
  // kolla saldo
  const balRes = await creditsBalance({ env }, userId);
  const balJson = await balRes.json();
  if (balJson.available < holdAmount) return json(402, err("INSUFFICIENT_CREDITS", "För lite credits"));

  const holdId = "h_" + uuid();
  const exp = now() + 15 * 60 * 1000;
  await env.DB.prepare(
    "INSERT INTO credit_holds (id,user_id,quote_id,amount,status,expires_at,created_at) VALUES (?1,?2,?3,?4,'HELD',?5,?6)"
  ).bind(holdId, userId, quote_id, holdAmount, exp, now()).run();
  return json(200, { hold_id: holdId, amount: holdAmount, expires_at: exp });
}

async function ledgerAdd(env, userId, delta, reason, refId = null) {
  // fetch current balance
  const total = await env.DB.prepare("SELECT COALESCE(SUM(delta),0) as bal FROM credit_ledger WHERE user_id=?1").bind(userId).first();
  const prev = total?.bal || 0;
  const next = prev + delta;
  await env.DB.prepare(
    "INSERT INTO credit_ledger (id,user_id,delta,reason,ref_id,balance_after,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)"
  ).bind(uuid(), userId, delta, reason, refId, next, now()).run();
}

/* ---------- Characters & Episodes ---------- */
async function createCharacter({ req, env }, userId) {
  const body = await readJson(req);
  const display_name = (body.display_name || "").trim();
  if (!display_name) return json(400, err("BAD_REQUEST", "display_name krävs"));
  const id = "c_" + uuid();
  await env.DB.prepare(
    "INSERT INTO characters (id,user_id,display_name,archetype_key,traits_json,voice_preset,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)"
  ).bind(id, userId, display_name, body.archetype_key || null, JSON.stringify(body.traits || {}), body.voice_preset || null, now()).run();
  return json(200, { character_id: id });
}
async function listCharacters({ env }, userId) {
  const rows = await env.DB.prepare("SELECT id, display_name, archetype_key, voice_preset, created_at FROM characters WHERE user_id=?1 ORDER BY created_at DESC")
    .bind(userId).all();
  return json(200, { items: rows.results || [] });
}
async function listEpisodes({ env, url }, userId) {
  const character_id = url.searchParams.get("character_id");
  const q = character_id ? 
    "SELECT id as episode_id, character_id, episode_no, level, lang, tldr, words, tts_seconds, cost_credits, model_provider, created_at FROM episodes WHERE user_id=?1 AND character_id=?2 ORDER BY episode_no DESC" :
    "SELECT id as episode_id, character_id, episode_no, level, lang, tldr, words, tts_seconds, cost_credits, model_provider, created_at FROM episodes WHERE user_id=?1 ORDER BY created_at DESC";
  const params = character_id ? [userId, character_id] : [userId];
  const rows = await env.DB.prepare(q).bind(...params).all();
  return json(200, { items: rows.results || [] });
}

/* ---------- Cache ---------- */
async function buildCacheKey(arch, level, lang, voice) {
  const base = `arch:${arch}|lvl:${level}|lang:${lang}|voice:${voice}|v1`;
  const h = await sha512(base);
  return `ck_${h}`;
}
async function cacheCheck({ req, env }, userId) {
  const body = await readJson(req);
  const norm = normalizePrompt(body.prompt || "");
  const arch = detectArchetype(norm);
  const cacheKey = await buildCacheKey(arch, body.level || 1, body.lang || "sv", body.voice_preset || "basic:female");
  const row = await env.DB.prepare("SELECT key FROM cache_entries WHERE key=?1").bind(cacheKey).first();
  return json(200, { hit: !!row, cache_key: cacheKey, archetype_key: arch });
}

/* ---------- Generate ---------- */
async function generate({ req, env }, userId) {
  const body = await readJson(req);
  const idem = req.headers.get("X-Idempotency-Key") || "idem:" + uuid();
  const { quote_id, hold_id } = body || {};
  if (!quote_id || !hold_id) return json(400, err("BAD_REQUEST", "quote_id och hold_id krävs"));

  // idempotens
  const existing = await env.DB.prepare("SELECT id, status FROM gen_jobs WHERE user_id=?1 AND idempotency_key=?2")
    .bind(userId, idem).first();
  if (existing && existing.status !== "FAILED") {
    return json(200, { job_id: existing.id, status: existing.status });
  }

  const qraw = await env.KV.get(`quote:${userId}:${quote_id}`);
  if (!qraw) return json(400, err("QUOTE_EXPIRED", "Offerten har löpt ut"));
  const quote = JSON.parse(qraw);
  const hold = await env.DB.prepare("SELECT * FROM credit_holds WHERE id=?1 AND user_id=?2").bind(hold_id, userId).first();
  if (!hold || hold.status !== "HELD" || hold.expires_at < now()) return json(400, err("HOLD_INVALID", "Ogiltig eller utgången hold"));

  // Job init
  const jobId = "j_" + uuid();
  const prompt_raw = quote.prompt;
  const prompt_norm = normalizePrompt(prompt_raw);
  const arch = quote.arch || detectArchetype(prompt_norm);
  const cacheKey = await buildCacheKey(arch, quote.level, quote.lang, quote.voice_preset);

  await env.DB.prepare(
    "INSERT INTO gen_jobs (id,user_id,idempotency_key,prompt_raw,prompt_norm,archetype_key,character_id,continue_episode,level,quote_id,hold_id,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'RUNNING',?12)"
  ).bind(jobId, userId, idem, prompt_raw, prompt_norm, arch, body.character_id || null, (quote.mode === "CONTINUE") ? 1 : 0, quote.level, quote_id, hold_id, now()).run();

  let usedCache = false;
  let textKey, ttsKey, words, seconds, provider = "Mock";
  let textContent;

  // 1) Cache?
  const cacheRow = await env.DB.prepare("SELECT * FROM cache_entries WHERE key=?1").bind(cacheKey).first();
  if (cacheRow) {
    usedCache = true;
    textKey = cacheRow.text_r2_key;
    ttsKey = cacheRow.tts_r2_key;
    words = cacheRow.words;
    seconds = cacheRow.tts_seconds || Math.round(words / 2.6);
    textContent = await r2GetText(env, textKey);
  }

  // 2) Generera om ingen cache
  if (!usedCache) {
    // Generator
    const mock = env.BN_MOCK_PROVIDERS === "1";
    if (mock) {
      const levelText = quote.level >= 5 ? "mycket explicit" : quote.level >= 4 ? "het och detaljerad" : quote.level >= 3 ? "sensuell+" : "romantisk";
      textContent = mockGenerateSv(prompt_raw, levelText, quote.words_target);
      provider = "Mock";
    } else {
      // försök OpenRouter → Mistral → OpenAI (enkel fallback)
      const tryOrder = ["OpenRouter", "Mistral", "OpenAI"];
      let success = false, errMsg = "";
      for (const p of tryOrder) {
        try {
          const t = await llmGenerate(env, p, {
            prompt: prompt_raw,
            level: quote.level,
            lang: quote.lang,
            words: quote.words_target
          });
          if (t && t.length > 50) {
            textContent = t;
            provider = p;
            success = true;
            break;
          }
        } catch (e) { errMsg = e.message || String(e); }
      }
      if (!success) {
        await markJobFail(env, jobId, "GEN_MODEL_TIMEOUT", "Modellen svarade inte: " + errMsg);
        await releaseHoldRefund(env, userId, hold_id, quote.total_credits);
        return json(500, err("GEN_MODEL_TIMEOUT", "Modellen svarade inte"));
      }
    }

    // spara text i R2
    words = countWords(textContent);
    textKey = `text/${cacheKey}.txt`;
    await env.R2.put(textKey, textContent, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });

    // skapa cache entry (bara för generiska mallar)
    await env.DB.prepare(
      "INSERT OR REPLACE INTO cache_entries (key,level,lang,voice_preset,text_r2_key,words,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)"
    ).bind(cacheKey, quote.level, quote.lang, quote.voice_preset, textKey, words, now()).run();
  }

  // 3) TTS (om begärt)
  if (quote.tts?.enabled) {
    const approxSecs = Math.round(words / 2.6);
    seconds = approxSecs;
    const hasEL = !!env.ELEVENLABS_API_KEY && quote.tts?.tier === "EL" && env.BN_MOCK_PROVIDERS !== "1";
    if (hasEL) {
      try {
        const voiceId = mapVoice(quote.voice_preset); // enkla presets
        const audio = await elevenlabsTTS(env, voiceId, textContent, quote.lang || "sv");
        ttsKey = `tts/${cacheKey}.mp3`;
        await env.R2.put(ttsKey, audio, { httpMetadata: { contentType: "audio/mpeg" } });
        // uppdatera cache med tts
        await env.DB.prepare("UPDATE cache_entries SET tts_r2_key=?1, tts_seconds=?2 WHERE key=?3")
          .bind(ttsKey, seconds, cacheKey).run();
      } catch (e) {
        // fallback BASIC TTS (mockad som tomt/avsaknad av audio i denna GC)
        ttsKey = null;
      }
    } else {
      // BASIC eller mock → hoppa över (frontend spelar text om ingen audio)
      ttsKey = null;
    }
  }

  // 4) Kostnad & holds
  let finalCredits = quote.total_credits;
  // Om cache användes till 50% redan i quote – ta quote som sanning (enkelt och förutsägbart)
  // Capture & release
  await ledgerAdd(env, userId, -finalCredits, "GENERATE", jobId);
  await env.DB.prepare("UPDATE credit_holds SET status='CAPTURED' WHERE id=?1").bind(hold_id).run();
  const refund = Math.max(0, hold.amount - finalCredits);
  if (refund > 0) await ledgerAdd(env, userId, +refund, "REFUND", jobId);

  // 5) Episode save
  const characterId = body.character_id || null;
  const nextNo = await nextEpisodeNo(env, userId, characterId);
  const tldr = quickTLDR(textContent);
  const textUrl = await r2Signed(env, textKey);
  const audioUrl = ttsKey ? await r2Signed(env, ttsKey) : null;

  const episodeId = "e_" + uuid();
  await env.DB.prepare(
    "INSERT INTO episodes (id,user_id,character_id,episode_no,level,lang,tldr,text_r2_url,tts_r2_url,words,tts_seconds,cost_credits,model_provider,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)"
  ).bind(episodeId, userId, characterId, nextNo, quote.level, quote.lang, tldr, textKey, ttsKey, words, seconds || null, finalCredits, provider, now()).run();

  // 6) Done
  await env.DB.prepare("UPDATE gen_jobs SET status='DONE', cost_credits=?1, cache_key=?2, model_provider=?3, finished_at=?4 WHERE id=?5")
    .bind(finalCredits, cacheKey, provider, now(), jobId).run();

  return json(200, {
    job_id: jobId,
    status: "DONE",
    cache_used: usedCache,
    episode: {
      episode_id: episodeId,
      episode_no: nextNo,
      level: quote.level,
      tldr,
      words,
      tts_seconds: seconds || null,
      text_url: textUrl,
      audio_url: audioUrl
    },
    cost: { credits: finalCredits, hold_released: Math.max(0, hold.amount - finalCredits) },
    provider
  });
}

async function markJobFail(env, jobId, code, message) {
  await env.DB.prepare("UPDATE gen_jobs SET status='FAILED', error=?1, finished_at=?2 WHERE id=?3")
    .bind(`${code}:${message}`, now(), jobId).run();
}
async function releaseHoldRefund(env, userId, holdId, credits) {
  await env.DB.prepare("UPDATE credit_holds SET status='RELEASED' WHERE id=?1").bind(holdId).run();
  await ledgerAdd(env, userId, +credits, "REFUND", holdId);
}
async function nextEpisodeNo(env, userId, characterId) {
  if (!characterId) return 1;
  const row = await env.DB.prepare("SELECT MAX(episode_no) as m FROM episodes WHERE user_id=?1 AND character_id=?2")
    .bind(userId, characterId).first();
  const m = row?.m || 0;
  return m + 1;
}
function countWords(t) {
  return (t || "").trim().split(/\s+/).filter(Boolean).length;
}
function quickTLDR(t) {
  // enkel TLDR: ta första 2 meningar eller 35 ord
  const parts = (t || "").split(/(?<=[.!?])\s+/);
  if (parts.length >= 2) return (parts[0] + " " + parts[1]).slice(0, 400);
  return (t || "").split(/\s+/).slice(0, 35).join(" ");
}

/* ---------- External providers (LLM & TTS) ---------- */
async function llmGenerate(env, provider, { prompt, level, lang, words }) {
  // OBS: Du måste sätta dina nycklar i wrangler secrets för att detta ska köras på riktigt.
  const sys = [
    `Skriv en ${lang === "sv" ? "svensk" : "engelsk"} erotisk berättelse.`,
    `Håll nivån till Level ${level} (1=romantisk ... 5=explicit).`,
    `Mål: ${words} ord (±20%).`,
    `Undvik olagliga teman.`
  ].join(" ");
  const user = prompt;

  if (provider === "OpenRouter") {
    const key = env.OPENROUTER_API_KEY;
    if (!key) throw new Error("Saknar OPENROUTER_API_KEY");
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct:free", // välj din modell
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ],
        temperature: 0.9
      })
    });
    const j = await r.json();
    return j?.choices?.[0]?.message?.content || "";
  }

  if (provider === "Mistral") {
    const key = env.MISTRAL_API_KEY;
    if (!key) throw new Error("Saknar MISTRAL_API_KEY");
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ],
        temperature: 0.9
      })
    });
    const j = await r.json();
    return j?.choices?.[0]?.message?.content || "";
  }

  if (provider === "OpenAI") {
    const key = env.OPENAI_API_KEY;
    if (!key) throw new Error("Saknar OPENAI_API_KEY");
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ],
        temperature: 0.9
      })
    });
    const j = await r.json();
    return j?.choices?.[0]?.message?.content || "";
  }

  throw new Error("Okänd provider");
}

function mapVoice(preset) {
  // mycket enkel mapping – byt till dina ElevenLabs voice IDs
  if (!preset) return "21m00Tcm4TlvDq8ikWAM"; // default
  if (preset.includes("charlotte")) return "EXAVITQu4vr4xnSDxMaL";
  if (preset.includes("male")) return "TxGEqnHWrfWFTfGW9XjX";
  return "21m00Tcm4TlvDq8ikWAM";
}
async function elevenlabsTTS(env, voiceId, text, lang) {
  const key = env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Saknar ELEVENLABS_API_KEY");
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.5 }
    })
  });
  if (!r.ok) throw new Error(`EL TTS fel: ${r.status}`);
  return await r.arrayBuffer();
}

/* ---------- R2 helpers ---------- */
async function r2GetText(env, key) {
  const obj = await env.R2.get(key);
  if (!obj) return "";
  const txt = await obj.text();
  return txt;
}
async function r2Signed(env, key) {
  // En enkel "signerad" variant för demo: returnera en gateway-URL
  // I produktion kan du exponera en proxy endpoint som streamer från R2 med auth-kontroll.
  return `r2://${key}`;
}

/* ---------- Payments (stub för flödestest) ---------- */
async function paymentsSessionStub({ env }, userId) {
  // Returnera en dummy-URL så frontend kan "redirecta" i demo
  const sess = "ps_" + uuid();
  // I riktig drift: skapa session hos CCBill och få redirect URL.
  return json(200, { redirect_url: `https://secure.ccbill.com/dummy/${sess}` });
}
async function paymentsWebhookStub({ env, req }) {
  // I riktig drift: verifiera signaturer/parametrar från CCBill.
  // Här ger vi 500 credits för demo.
  const body = await readJson(req);
  const userId = body.user_id;
  if (!userId) return json(400, err("BAD_REQUEST", "user_id krävs"));
  await ledgerAdd(env, userId, +500, "TOPUP", "ccbill_stub");
  return json(200, { ok: true });
}

/* ---------- Mock text ---------- */
function mockGenerateSv(prompt, levelText, targetWords) {
  const base = `(${levelText}) ${prompt}. `;
  const para = "Hon möter blicken, ord blir överflödiga. Händerna hittar rätt, andetagen blir tyngre, och rummet krymper tills bara ni två finns. ";
  let words = 0, out = "";
  while (words < targetWords) {
    const add = (Math.random() > 0.3) ? para : base;
    out += add;
    words = countWords(out);
  }
  return out.trim();
}
