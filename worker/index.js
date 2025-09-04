// --- POST /api/v1/characters/create ---------------
if (path === "/api/v1/characters/create" && method === "POST") {
  const body = await safeJson(request); // { user_id?, name }
  let user_id = (body && body.user_id) || null;
  const name = (body && body.name || "").trim();

  if (!name) return json({ error: "name required" }, 400);

  // 1) Säkerställ att vi har en giltig user
  if (!user_id) {
    user_id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO users (id, created_at) VALUES (?, datetime('now'))`
    ).bind(user_id).run();
  } else {
    // Om user_id gavs: kontrollera att den finns; annars skapa
    const u = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
      .bind(user_id).first();
    if (!u) {
      await env.DB.prepare(
        `INSERT INTO users (id, created_at) VALUES (?, datetime('now'))`
      ).bind(user_id).run();
    }
  }

  // 2) Skapa karaktären
  const character_id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO characters (id, user_id, name, created_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).bind(character_id, user_id, name).run();

  return json({ ok: true, user_id, character_id, name });
}
