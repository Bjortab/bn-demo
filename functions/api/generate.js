// /functions/api/generate.js
// Cloudflare Pages Functions – GENERATE STORY

export const onRequestPost = async ({ request, env }) => {
  try {
    const { idea, level, minutes } = await request.json();

    // --- Basic validation ---
    const _idea = (typeof idea === "string" ? idea : "").trim();
    const _level = Number.isFinite(level) ? Math.max(1, Math.min(5, Number(level))) : 2;
    const _minutes = Number.isFinite(minutes) ? Math.max(1, Math.min(10, Number(minutes))) : 5;

    if (!_idea) {
      return json({ ok: false, error: "empty_idea" }, 400);
    }

    // ~170 ord/minut
    const targetWords = Math.max(120, Math.min(1200, Math.round(_minutes * 170)));

    // ======== WORD BANKS (kontrollerad användning) ========
    const soft = [
      "värme mellan oss", "långsam kyss", "dov längtan", "hans händer mot min rygg",
      "hennes händer i mitt hår", "pausen i blicken", "hjärtat som rusar"
    ];

    const sensual = [
      "läppar mot hud", "kroppar nära", "fingrar på nyckelben",
      "sval hals som hettar", "andning som hakar upp sig",
      "tyget som glider", "skälvning när huden möts"
    ];

    const hot = [
      "hans lem", "hennes sköte", "våt värme", "djupare rytm",
      "tungan som cirklar", "rygg mot vägg", "greppet hårdnar",
      "höfter som svarar", "han tränger in", "hon rider honom",
      "svetten mellan oss", "stön som brister"
    ];

    // Level-specifika styrningar
    const levelSpecs = {
      1: {
        tone: "romantisk, antydande, utan explicita ord",
        mustUse: soft.slice(0, 3),
        avoid: [...hot],
      },
      2: {
        tone: "mild och sensuell, tydligt vuxen men varsam",
        mustUse: [soft[3], sensual[0]],
        avoid: ["lem", "tränger in", "fitta", "kuk", "klitoris"], // håll nere explicit
      },
      3: {
        tone: "sensuell och tydligare, men elegans kvar",
        mustUse: [sensual[1], sensual[3]],
        avoid: ["fitta", "kuk"], // spar dessa för nivå 5
      },
      4: {
        tone: "het och direkt, konkreta handlingar, men utan grova ord",
        mustUse: ["våt värme", "rytm som tilltar", "tungan som cirklar"],
        avoid: ["fitta", "kuk"], // flyttat till nivå 5
      },
      5: {
        tone: "rakt, hett och explicit men samtyckande och respektfullt",
        mustUse: [
          "hans lem", "hennes sköte", "han tränger in", "hon rider honom",
          "tungan som cirklar", "våt värme", "höfter som svarar"
        ],
        avoid: [], // allt tillåtet inom samtycke och vuxna
      },
    };

    const spec = levelSpecs[_level];

    // ======== SYSTEM PROMPT (struktur + regler) ========
    const system = [
      "Du skriver på svenska en sammanhängande erotisk kortnovell avsedd att läsas upp.",
      "Alltid en röd tråd: 1) inledning, 2) stegring, 3) hetta, 4) avtoning.",
      "Berättarperspektiv: jag-form. Partnern är 'hon' om inte annat anges i idén.",
      "Strikt vuxna och samtyckande. Inga minderåriga, våld, tvång, blod, smärta eller degradering.",
      "Undvik upprepningar och klyschor. Variera ordval och meningstakt.",
      `Ton: ${spec.tone}.`,
      "I nivå 1–2: antydan och värme. I nivå 3–4: tydligare fysisk närhet. I nivå 5: tydlig och rakt sexuell handling (respektfullt).",
      "Avsluta utan moralkakor – en lugn efterton räcker.",
      `Sikta på cirka ${targetWords} ord.`,
      "Använd de här fraserna diskret där de passar naturligt:",
      `MÅSTE-FRASER: ${spec.mustUse.join(", ")}.`,
      spec.avoid.length ? `UNDVIK (använd inte): ${spec.avoid.join(", ")}.` : "Inga särskilda förbud utöver standardreglerna.",
    ].join(" ");

    // ======== USER PROMPT ========
    const user = [
      `IDÉ: ${_idea}`,
      "Bygg berättelse med tydliga övergångar (kort, men närvarande: ---).",
      "Följ strukturen (inledning → stegring → hetta → avtoning).",
      "Håll 'jag' + 'hon' konsekvent. Inga könsbyten.",
      "Skriv utan rubriker och utan listor. Endast ren prosa.",
    ].join("\n");

    // ======== CALL LLM (Mistral primärt, annars OpenAI) ========
    const mistralKey = env.MISTRAL_API_KEY || env.MISTRAL_KEY;
    const openaiKey  = env.OPENAI_API_KEY || env.OPENAI_KEY;

    let text = null;
    let usedModel = null;

    if (mistralKey) {
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${mistralKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-large-latest",
          temperature: _level >= 4 ? 0.9 : 0.8,
          max_tokens: Math.min(1400, Math.round(targetWords * 1.5)),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!r.ok) {
        const err = await safeJson(r);
        return json({ ok: false, error: "mistral_error", detail: err }, 502);
      }
      const data = await r.json();
      text = data?.choices?.[0]?.message?.content?.trim() || null;
      usedModel = "mistral";
    } else if (openaiKey) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: _level >= 4 ? 0.9 : 0.8,
          max_tokens: Math.min(1400, Math.round(targetWords * 1.5)),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!r.ok) {
        const err = await safeJson(r);
        return json({ ok: false, error: "openai_error", detail: err }, 502);
      }
      const data = await r.json();
      text = data?.choices?.[0]?.message?.content?.trim() || null;
      usedModel = "openai";
    } else {
      return json({ ok: false, error: "missing_api_key", detail: "No MISTRAL_API_KEY or OPENAI_API_KEY found in Cloudflare env." }, 500);
    }

    if (!text) {
      return json({ ok: false, error: "empty_story" }, 502);
    }

    // Snygga till eventuella markdown/avdelare
    text = text.replace(/^---\s*$/gm, "").trim();

    return json({ ok: true, text, model: usedModel }, 200);
  } catch (err) {
    return json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500);
  }
};

// ===== Helpers =====
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const safeJson = async (r) => {
  try { return await r.json(); } catch { return { status: r.status, statusText: r.statusText }; }
};
