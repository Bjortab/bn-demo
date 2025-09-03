// worker/index.js — BN v1.5.2 (Mistral-ready / OpenRouter fallback / Mock fallback)

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/,''); // trim trailing /
      const method = request.method.toUpperCase();

      // --- ROUTES ---
      if (path === "" || path === "/") return text("BN worker v1.5.2");

      if (path === "/api/v1/status" && method === "GET") {
        const provider = pickProvider(env);
        const payload = {
          lm: [
            { name: "Mistral", healthy: !!env.MISTRAL_API_KEY, models: [env.MISTRAL_MODEL || "mistral-small-latest"] },
            { name: "OpenRouter", healthy: !!env.OPENROUTER_KEY, models: [env.OR_MODEL || "mistralai/mixtral-8x7b-instruct"] }
          ],
          tts: [{ name: "ElevenLabs", healthy: !!env.ELEVENLABS_API_KEY, tier: "EL" }],
          version: "v1.5.2",
          flags: { MOCK: envFlag(env, "MOCK", false) },
          provider
        };
        return json(payload);
      }

      if (path === "/api/v1/session" && method === "GET") {
        const user_id = crypto.randomUUID();
        return json({ user_id, token: `demo-${crypto.randomUUID()}`, created: new Date().toISOString() });
      }

      if (path === "/api/v1/characters/create" && method === "POST") {
        const b = await request.json();
        ensure(b, ["user_id","name"]);
        const id = crypto.randomUUID();
        await env.DB.prepare(`INSERT INTO characters (id,user_id,name,created_at) VALUES (?1,?2,?3,datetime('now'))`)
          .bind(id, b.user_id, b.name).run();
        return json({ character_id: id, name: b.name });
      }

      if (path === "/api/v1/arcs/start" && method === "POST") {
        const b = await request.json();
        ensure(b, ["user_id","character_id","title"]);
        const id = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO story_arcs (id, user_id, character_id, title, level_min, level_max, created_at)
          VALUES (?1,?2,?3,?4, COALESCE(?5,1), COALESCE(?6,5), datetime('now'))
        `).bind(id, b.user_id, b.character_id, b.title, b.level_min ?? 1, b.level_max ?? 5).run();
        return json({ arc_id: id, next_step: 1 });
      }

      if (path === "/api/v1/episodes/generate" && method === "POST") {
        const b = await request.json();
        ensure(b, ["user_id","character_id","arc_id","prompt","level","lang","words"]);

        // hämta ev minnessammanfattning
        const prev = await env.DB.prepare(`
          SELECT memory_summary FROM episodes
          WHERE user_id=?1 AND character_id=?2
          ORDER BY created_at DESC LIMIT 1
        `).bind(b.user_id, b.character_id).first();
        const memory_summary = prev?.memory_summary || "";

        const { story, provider, err } = await generateStoryWithProvider(env, {
          prompt: b.prompt, level: clamp(b.level,1,5), lang: b.lang || "sv", words: clamp(b.words,60,600), memory_summary
        });

        const ep_id = crypto.randomUUID();
        const arc_step = await nextArcStep(env, b.user_id, b.character_id, b.arc_id);

        // simple summaries (billigt)
        const summary = `KONCEPT: ${b.prompt}\n[SLUT]`;
        const memory  = `KONCEPT: ${b.prompt} (Nivå ${b.level})\n[SLUT]`;

        await env.DB.prepare(`
          INSERT INTO episodes (id,user_id,character_id,arc_id,level,lang,words,story_text,episode_summary,memory_summary,arc_step,created_at)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,datetime('now'))
        `).bind(ep_id, b.user_id, b.character_id, b.arc_id, b.level, b.lang, b.words, story, summarizeForList(story), memory, arc_step).run();

        return json({ episode_id: ep_id, story, summary, memory_summary: memory, provider, arc_step, error: err });
      }

      if (path === "/api/v1/episodes/by-character" && method === "POST") {
        const b = await request.json();
        ensure(b, ["user_id","character_id"]);
        const limit = clamp(b.limit ?? 20, 1, 100);
        const rows = await env.DB.prepare(`
          SELECT id, level, lang, words, arc_step, episode_summary, created_at
          FROM episodes WHERE user_id=?1 AND character_id=?2
          ORDER BY created_at DESC LIMIT ?3
        `).bind(b.user_id, b.character_id, limit).all();
        return json({ items: rows.results || [] });
      }

      if (path === "/api/v1/feedback/submit" && method === "POST") {
        const b = await request.json();
        ensure(b, ["message"]);
        const id = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO feedback (id, user_id, email, topic, message, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
        `).bind(id, b.user_id || null, b.email || null, b.topic || null, b.message).run();
        return json({ ok: true, id });
      }

      return err(404, "Not found");
    } catch (e) {
      return err(500, e.message || "Server error");
    }
  }
};

/* ----------------------- Provider & generation ----------------------- */

function envFlag(env, key, def=false) {
  const v = (env[key] ?? "").toString().trim().toLowerCase();
  if (["true","1","yes","on"].includes(v)) return true;
  if (["false","0","no","off"].includes(v)) return false;
  return def;
}
function pickProvider(env) {
  if ((env.PROVIDER || "").toUpperCase() === "MISTRAL" && env.MISTRAL_API_KEY) return "MISTRAL";
  if (env.OPENROUTER_KEY) return "OPENROUTER";
  return "MOCK";
}

async function callProvider(env, { system, user, max_tokens = 1200 }) {
  const provider = pickProvider(env);
  if (provider === "MISTRAL") return callMistral(env, { system, user, max_tokens });
  if (provider === "OPENROUTER") return callOpenRouter(env, { system, user, max_tokens });
  return { text: mockFrom(system,user), provider: "MOCK" };
}

async function callMistral(env, { system, user, max_tokens }) {
  const apiKey = env.MISTRAL_API_KEY;
  const model  = env.MISTRAL_MODEL || "mistral-small-latest";
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, temperature: 0.85, max_tokens,
      messages: [{ role:"system", content: system }, { role:"user", content: user }]
    })
  });
  if (!res.ok) throw new Error(`Mistral ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return { text, provider: `Mistral:${model}` };
}

async function callOpenRouter(env, { system, user, max_tokens }) {
  const key   = env.OPENROUTER_KEY;
  const model = env.OR_MODEL || "mistralai/mixtral-8x7b-instruct";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type":"application/json" },
    body: JSON.stringify({
      model, temperature: 0.85, max_tokens,
      messages: [{ role:"system", content: system }, { role:"user", content: user }]
    })
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return { text, provider: `OpenRouter:${model}` };
}

function buildSystem(level, lang) {
  return [
    `Du skriver erotiska noveller på ${lang==="en"?"engelska":"svenska"}. Följ nivå 1–5 strikt.`,
    `Regler:`,
    `1=romantisk (inga kroppsliga detaljer, inga könsord).`,
    `2=antydande sensuell (beröring/metaforer, inga könsord).`,
    `3=sensuell+ (mild explicit; vaga anatomiska ord, undvik grövsta uttryck).`,
    `4=het (explicit men stilrent; detaljer ok, undvik grövsta orden).`,
    `5=explicit (raka ord & tydliga beskrivningar; aldrig olagligheter, minderåriga, övergrepp, djur, incest och liknande).`,
    `Skriv 2–5 stycken, naturligt flyt, avsluta med [SLUT].`
  ].join("\n");
}
function buildUser({ prompt, level, lang, words, memory }) {
  return [
    `PROMPT: ${prompt}`,
    memory ? `KONTEXT: ${memory}` : null,
    `NIVÅ: ${level}`,
    `SPRÅK: ${lang}`,
    `LÄNGD: ca ${words} ord`,
    `Svara endast med berättelsen. Avsluta med [SLUT].`
  ].filter(Boolean).join("\n");
}

async function generateStoryWithProvider(env, { prompt, level, lang, words, memory_summary }) {
  if (envFlag(env,"MOCK",false)) {
    return { story: mockFrom(prompt,prompt), provider: "MOCK" };
  }
  const system = buildSystem(level, lang);
  const user   = buildUser({ prompt, level, lang, words, memory: memory_summary });
  try {
    const { text, provider } = await callProvider(env, { system, user, max_tokens: 1200 });
    const story = (text || "").trim();
    if (!story) throw new Error("empty");
    return { story, provider };
  } catch (e) {
    return { story: mockFrom(prompt, user), provider: "MOCK-FALLBACK", err: e.message };
  }
}

/* ----------------------- Utils & small helpers ----------------------- */

function summarizeForList(story) {
  return (story || "").replace(/\s+/g," ").slice(0, 280);
}
async function nextArcStep(env, user_id, character_id, arc_id) {
  const row = await env.DB.prepare(`SELECT MAX(arc_step) AS s FROM episodes WHERE user_id=?1 AND character_id=?2 AND arc_id=?3`)
    .bind(user_id, character_id, arc_id).first();
  return (row?.s || 0) + 1;
}
function ensure(obj, keys) {
  for (const k of keys) if (!obj || typeof obj[k]==="undefined" || obj[k]==="") throw bad(400, `Missing: ${k}`);
}
function clamp(n,min,max){ n=Number(n); if(Number.isNaN(n)) return min; return Math.min(max,Math.max(min,n)); }
function text(t, code=200){ return new Response(t, {status:code, headers: cors({"Content-Type":"text/plain; charset=utf-8"})}); }
function json(o, code=200){ return new Response(JSON.stringify(o), {status:code, headers: cors({"Content-Type":"application/json"})}); }
function err(code,msg){ return json({ error: msg }, code); }
function bad(code,msg){ const e=new Error(msg); e.status=code; throw e; }
function cors(h){ return { "Access-Control-Allow-Origin":"*", ...h }; }

function mockFrom(system,user){
  return `SYSTEM (mock): ${system.slice(0,120)}…
USER: ${user.slice(0,120)}…

Ögonblicket växte, tätt och förföriskt.
Löften i skuggan av ord. [SLUT]`;
}
