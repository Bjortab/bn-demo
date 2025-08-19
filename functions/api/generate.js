// /functions/api/generate.js
export const onRequestPost = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const idea = typeof body.idea === "string" ? body.idea.trim() : "";
    const level = clampInt(body.level ?? 2, 1, 5);
    const minutes = clampInt(body.minutes ?? 5, 1, 15);
    const exclude = Array.isArray(body.exclude) ? new Set(body.exclude) : new Set();

    if (!idea) return json({ ok: false, error: "empty_idea" }, 400);

    // Hämta lexikon
    const lexURL = new URL("../../lexicon.json", import.meta.url);
    const res = await fetch(lexURL);
    if (!res.ok) return json({ ok: false, error: "lexicon_load_failed" }, 500);
    const L = await res.json();

    // Flöden per nivå
    const flows = {
      1: ["intro", "setting", "förspel_mjukt", "afterglow"],
      2: ["intro", "setting", "avklädning", "förspel_mjukt", "afterglow"],
      3: ["intro", "setting", "avklädning", "förspel_mjukt", "förspel_hett", "afterglow"],
      4: ["intro", "setting", "avklädning", "förspel_mjukt", "förspel_hett", "oral", "penetration", "climax", "afterglow"],
      5: ["intro", "setting", "avklädning", "förspel_hett", "oral", "penetration", "climax", "afterglow"]
    };
    const flow = flows[level];

    // Antal meningar – ca 10–12 per minut
    const targetSentences = Math.max(8, Math.round(minutes * 10.5));

    // Viktning per steg
    const weights = {
      intro: 1, setting: 1, avklädning: level >= 2 ? 2 : 0,
      förspel_mjukt: level >= 1 ? 2 : 0, förspel_hett: level >= 3 ? 3 : 0,
      oral: level >= 4 ? 2 : 0, penetration: level >= 4 ? 3 : 0,
      climax: level >= 4 ? 2 : 0, afterglow: 1
    };
    const totalW = flow.reduce((s, k) => s + (weights[k] || 0), 0) || 1;

    // Hjälpare
    const used = new Set();
    const chunks = [];

    const pickNoRepeat = (arr, n) => {
      const pool = arr.filter(x => !used.has(x) && !exclude.has(x));
      const out = [];
      shuffle(pool);
      for (let i = 0; i < n && i < pool.length; i++) {
        used.add(pool[i]);
        out.push(pool[i]);
      }
      return out;
    };

    // Starta med idén (rensad och snyggad)
    chunks.push(sanitizeSentence(`Det här var utgångspunkten: ${idea}.`));

    // Lägg till tonalitetsord för nivån (som subtil “färg”)
    const toneWords = Array.isArray(L.level_words?.[String(level)]) ? L.level_words[String(level)] : [];
    if (toneWords.length) {
      const twPick = pickNoRepeat(toneWords, Math.min(4, Math.ceil(toneWords.length / 6)));
      if (twPick.length) {
        chunks.push(sanitizeSentence(`Stämningen var ${twPick.join(" och ")}.`));
      }
    }

    // Kategoritexter
    const templates = L.templates || {};

    // Portionera per steg
    let remaining = targetSentences - chunks.length;
    for (const step of flow) {
      if (!templates[step]?.length) continue;
      const portion = Math.max(1, Math.round((weights[step] || 1) / totalW * remaining));
      const picks = pickNoRepeat(templates[step], portion);
      chunks.push(...picks.map(sanitizeSentence));
      remaining = targetSentences - chunks.length;
      if (remaining <= 0) break;
    }

    // Booster för 4 och 5
    if (level === 4 && Array.isArray(L.level4_boosters)) {
      const b4 = pickNoRepeat(L.level4_boosters, 2);
      chunks.push(...b4.map(sanitizeSentence));
    }
    if (level === 5) {
      const b5 = []
        .concat(Array.isArray(L.level5_boosters) ? pickNoRepeat(L.level5_boosters, 3) : [])
        .concat(Array.isArray(L.level5_raw) ? pickNoRepeat(L.level5_raw, 3) : []);
      chunks.push(...b5.map(sanitizeSentence));
    }

    // Säkerställ klimax och slut
    ensureOne(flow, "climax", templates, chunks, used, exclude);
    ensureOne(flow, "afterglow", templates, chunks, used, exclude);

    // Polera och slå ihop
    const text = polish(chunks.join(" "));

    return json({ ok: true, text, used: Array.from(used) });
  } catch (err) {
    return json({ ok: false, error: "server_error", detail: String(err) }, 500);
  }
};

// ===== utilities =====
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v) || 0);
  return Math.min(max, Math.max(min, n));
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function sanitizeSentence(s) {
  let t = String(s).trim();
  if (!t) return "";
  // Inga dubbla mellanslag
  t = t.replace(/\s+/g, " ");
  // Stor bokstav i början
  t = t.charAt(0).toUpperCase() + t.slice(1);
  // Avsluta med punkt om saknas
  if (!/[.!?…]$/.test(t)) t += ".";
  return t;
}

function ensureOne(flow, step, templates, chunks, used, exclude) {
  if (!flow.includes(step) || !templates[step]?.length) return;
  const has = chunks.some(c => templates[step].some(x => c.includes(x.slice(0, 12))));
  if (!has) {
    const pick = templates[step].find(x => !used.has(x) && !exclude.has(x)) || templates[step][0];
    used.add(pick);
    chunks.push(sanitizeSentence(pick));
  }
}

function polish(text) {
  return text
    .replace(/\s+,\s+/g, ", ")
    .replace(/\s+\.\s+/g, ". ")
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}
