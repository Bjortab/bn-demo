// functions/api/generate.js
// Cloudflare Pages Function: POST /api/generate
// Inmatning: { idea: string, level: 1..5, minutes: 3|5 }
// Utmatning: { ok: true, text } eller { ok:false, error, detail }

export const onRequestPost = async ({ request, env }) => {
  const abortMs = 28000; // 28s skydd mot hängningar
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort("timeout"), abortMs);

  try {
    // ---- 1) Läs body & validera ----
    const { idea, level, minutes } = await request.json().catch(() => ({}));

    if (!idea || typeof idea !== "string" || !idea.trim()) {
      return jsonError(400, "empty_idea", "Saknar 'idea' (icke-tom sträng).");
    }
    const lvl = Number(level);
    if (![1, 2, 3, 4, 5].includes(lvl)) {
      return jsonError(400, "bad_level", "Level måste vara 1–5.");
    }
    const mins = Number(minutes) || 5;
    const targetWords = clamp(Math.round(mins * 170), 200, 900);

    // ---- 2) Hämta lexikon (ordlistor) ----
    let lex = null;
    try {
      // lexicon.json ligger i repo-roten (../.. från den här filen)
      // Cloudflare Workers stödjer JSON import med assert i ESM.
      lex = (await import("../../lexicon.json", { assert: { type: "json" } }))
        .default;
    } catch {
      // Fallback – minimal struktur om filen saknas
      lex = { base: [], level1: [], level2: [], level3: [], level4: [], level5: [] };
    }

    // Bygg ordpool per nivå. För 4–5 kaskader vi in tidigare nivåer
    // så det finns mycket variation.
    const poolBase = Array.isArray(lex.base) ? lex.base : [];
    const pools = {
      1: uniq([...poolBase, ...(lex.level1 || [])]),
      2: uniq([...poolBase, ...(lex.level1 || []), ...(lex.level2 || [])]),
      3: uniq([...poolBase, ...(lex.level1 || []), ...(lex.level2 || []), ...(lex.level3 || [])]),
      4: uniq([
        ...poolBase,
        ...(lex.level1 || []),
        ...(lex.level2 || []),
        ...(lex.level3 || []),
        ...(lex.level4 || []),
      ]),
      5: uniq([
        ...poolBase,
        ...(lex.level1 || []),
        ...(lex.level2 || []),
        ...(lex.level3 || []),
        ...(lex.level4 || []),
        ...(lex.level5 || []),
      ]),
    };

    // ---- 3) Sätt stilregler per nivå (svenska) ----
    const styleByLevel = {
      1: [
        "Ton: romantisk, antydande, inga grafiska detaljer.",
        "Fokus på blickar, stämning och pirr.",
        "Undvik explicita kroppstermer.",
      ],
      2: [
        "Ton: mild sensuell, försiktiga beröringar.",
        "Lätta konkreta detaljer men inte grafiskt.",
      ],
      3: [
        "Ton: tydligt sensuell, konkreta detaljer, ändå stilfull.",
        "Alltid samtycke, vuxna, trygghet.",
      ],
      4: [
        "Ton: het, direkt sensuell prosa, utan att bli vulgär.",
        "Tydliga handlingar och kroppskänsla. Alltid samtycke.",
      ],
      5: [
        "Ton: mest het. Intensiv, handlingsdriven, inga omskrivningar.",
        "Använd ord och fraser från ordlistan för nivå 5 där det passar naturligt.",
        "Alltid vuxna, tydligt samtycke, respekt – men tydliga, direkta beskrivningar.",
      ],
    };

    // För att minska upprepningar: meta-regler
    const repetitionRules = [
      "Undvik att upprepa samma bild/metafor två gånger.",
      "Variera kroppsdetaljer: använd olika sinnen (syn, hörsel, doft, smak, känsel).",
      "Håll berättarperspektivet konsekvent (jag/han/hon) genom hela texten.",
      "Ge texten tydlig början, mitt, och slut (avrunda sista stycket snyggt).",
    ];

    // Bygg en lexikon-hint som inte tvingar slaviskt men styr nivån
    const vocabHint =
      pools[lvl] && pools[lvl].length
        ? `Ord/fraser som får förekomma (variera naturligt, inget tvång): ${sample(pools[lvl], 50).join(", ")}.`
        : "Variera ordvalet, undvik klyschor och upprepning.";

    // ---- 4) System- och användarprompt ----
    const systemPrompt = [
      "Du skriver en kort svensk ljudnovell.",
      `Målord: ~${targetWords} (±15%).`,
      ...styleByLevel[lvl],
      ...repetitionRules,
      vocabHint,
    ].join("\n- ");

    const userPrompt = [
      `Idé: "${idea.trim()}"`,
      "Skriv en sammanhängande novell i löpande svensk prosa.",
      "Avrunda med en naturlig slutmening.",
    ].join("\n");

    // ---- 5) Modellroutning: OpenAI (1–3) / Mistral (4–5) ----
    if (lvl <= 3) {
      const key = (env.OPENAI_API_KEY || "").trim();
      if (!key) return jsonError(500, "missing_openai_key", "OPENAI_API_KEY saknas.");

      const body = {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1024,
        temperature: lvl === 1 ? 0.6 : lvl === 2 ? 0.8 : 0.9,
        // OBS: inga presence/frequency_penalty när vi vill vara kompatibla över tid
      };

      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const detail = await safeText(resp);
        return jsonError(resp.status, "openai_error", detail);
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) return jsonError(502, "empty_response", "OpenAI gav tomt svar.");
      return jsonOk({ text });
    } else {
      // Nivå 4–5: Mistral
      const key = (env.MISTRAL_API_KEY || "").trim();
      if (!key) return jsonError(500, "missing_mistral_key", "MISTRAL_API_KEY saknas.");

      const body = {
        model: "mistral-large-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1024,
        temperature: 0.95,
        // Viktigt: INGA frequency/presence_penalty här – inte stöd i Mistral
      };

      const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const detail = await safeText(resp);
        return jsonError(resp.status, "mistral_error", detail);
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) return jsonError(502, "empty_response", "Mistral gav tomt svar.");
      return jsonOk({ text });
    }
  } catch (err) {
    const detail =
      err?.name === "AbortError" ? "timeout" : err?.message || "unknown";
    return jsonError(500, "server_error", detail);
  } finally {
    clearTimeout(to);
  }
};

// ---------- Hjälpfunktioner ----------

function jsonOk(payload) {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(status, error, detail) {
  return new Response(JSON.stringify({ ok: false, error, detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function sample(arr, n) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

async function safeText(resp) {
  try {
    const t = await resp.text();
    return t?.slice(0, 2000);
  } catch {
    return "";
  }
}
