// functions/api/generate.js
// Textgenerator för BN – Mistral som textmotor
// Kräver: Secret i Cloudflare Pages -> MISTRAL_API_KEY

export const onRequestPost = async ({ request, env }) => {
  try {
    const { idea = "", minutes = 5, spice = 2 } = await safeJson(request);

    // Basvalidering – ge tydligare fel
    if (typeof idea !== "string" || !idea.trim()) {
      return jsonError(400, "Tom idé. Skriv en kort beskrivning av scenen.");
    }
    if (Number.isNaN(Number(minutes)) || minutes < 1 || minutes > 15) {
      return jsonError(400, "Ogiltig längd. Välj 1–15 minuter.");
    }
    if (![1, 2, 3, 4, 5].includes(Number(spice))) {
      return jsonError(400, "Ogiltig snusk-nivå (1–5).");
    }

    const MISTRAL_API_KEY = env.MISTRAL_API_KEY;
    if (!MISTRAL_API_KEY) {
      return jsonError(500, "Saknar MISTRAL_API_KEY i Cloudflare Pages → Settings → Variables & Secrets.");
    }

    // Ca ordmängd – 170 ord/min
    const targetWords = Math.round(170 * Number(minutes));

    // Stilprofil per snusk-nivå
    const profiles = {
      1: {
        label: "nivå 1 – mild, romantisk, antydningar",
        temperature: 0.85,
        top_p: 0.92,
        extra: [
          "håll det lågmält och romantiskt",
          "undvik rakt sexuellt språk; arbeta med antydningar"
        ]
      },
      2: {
        label: "nivå 2 – varm stämning, lätt erotik",
        temperature: 0.95,
        top_p: 0.92,
        extra: [
          "naturligt språk, varma beskrivningar utan grovt ordval",
          "konsent uttrycks tydligt"
        ]
      },
      3: {
        label: "nivå 3 – tydligt sensuell",
        temperature: 1.05,
        top_p: 0.9,
        extra: [
          "mer direkt sensuellt språk, men ej rått",
          "variera uttryck; undvik klyschor"
        ]
      },
      4: {
        label: "nivå 4 – het, explicit men elegant",
        temperature: 1.12,
        top_p: 0.9,
        extra: [
          "använd direkt erotiskt språk på ett respektfullt, vuxet sätt",
          "hög variation i ordval och meningsbyggnad"
        ]
      },
      5: {
        label: "nivå 5 – mycket het, explicit (icke-grafiskt)",
        temperature: 1.2,
        top_p: 0.9,
        extra: [
          "direkt och självsäkert erotiskt språk, alltid samtycke och trygghet",
          "undvik stötande eller förnedrande uttryck; inget minderårigt eller våld",
          "ingen pornografiskt grafisk anatomidetalj – håll det stilfullt, men hett"
        ]
      }
    };

    const p = profiles[Number(spice)];

    // Anti-klyscha-instruktioner
    const styleRules = [
      "undvik att upprepa samma fras eller metafor",
      "variera ordval, synonymer och rytm",
      "visa i scener (gest, dialog, sinnesintryck) i stället för att berätta",
      "håll tråden: början→stegring→klimax→avrundning",
      "använd naturlig dialog sparsamt men effektivt",
      "inga upprepade utrop eller identiska meningar"
    ];

    // System + user-meddelanden för Mistral chat/completions
    const systemMsg = [
      "Du skriver svenska, vuxna, samtyckande, sensuella noveller för uppläsning.",
      `Mål-längd ≈ ${targetWords} ord (±10%).`,
      `Ton: ${p.label}.`,
      ...p.extra.map((s) => `• ${s}`),
      ...styleRules.map((s) => `• ${s}`),
      "Avvisa allt som bryter mot lag eller innehåller minderåriga.",
    ].join("\n");

    const userMsg = [
      "Idé från användaren:",
      idea.trim(),
      "",
      "Skriv i jag-form eller nära tredjeperson; flytande och naturligt.",
      "Leverera EN sammanhängande text utan rubriker."
    ].join("\n");

    // Timeout – längre än tidigare (för att undvika “Fetch is aborted”)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // 45s

    const mistralRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        temperature: p.temperature,
        top_p: p.top_p,
        max_tokens: Math.min(4096, Math.round(targetWords * 1.8)), // gott om utrymme
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: userMsg }
        ]
      })
    }).catch((e) => {
      clearTimeout(timeout);
      throw e;
    });

    clearTimeout(timeout);

    if (!mistralRes.ok) {
      const errText = await safeText(mistralRes);
      return jsonError(502, `Text-API svarade ${mistralRes.status}. ${truncate(errText, 400)}`);
    }

    const data = await mistralRes.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    if (!raw.trim()) {
      return jsonError(502, "Textgenereringen gav tomt svar. Försök igen med en annan formulering.");
    }

    // Efterbearbetning för mindre klyschor/upprepningar
    let text = tidyText(raw);

    // Kort utdrag för UI (förhandsvisning)
    const excerpt = makeExcerpt(text, 420);

    return new Response(JSON.stringify({ ok: true, text, excerpt }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      status: 200
    });
  } catch (err) {
    // Tydliga fel
    const msg =
      err?.name === "AbortError"
        ? "Begäran avbröts (timeout). Prova igen."
        : (err?.message || "Okänt fel i generate.");
    return jsonError(500, msg);
  }
};

/* ---------- Hjälpfunktioner ---------- */

async function safeJson(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Enkel efterbearbetning för att minska upprepningar/klyschor
function tidyText(input) {
  let t = input.trim();

  // Normalisera whitespace
  t = t.replace(/\r/g, "");
  t = t.replace(/\n{3,}/g, "\n\n");

  // Ta bort exakt duplicerade meningar direkt efter varandra
  t = t.replace(/(^|\n)([^.\n!?]{8,}[.!?])\s+\2/gm, "$1$2");

  // Byt ut några vanliga klyschor
  const swaps = [
    [/hon stönade högt/gi, "hon drog efter andan"],
    [/han log mot mig/gi, "hans leende värmde genom hela mig"],
    [/ett hav av känslor/gi, "en våg som sköljde igenom kroppen"],
    [/kunde inte låta bli/gi, "jag gav efter utan att tveka"]
  ];
  for (const [re, rep] of swaps) t = t.replace(re, rep);

  // N-gram guard: om samma 4-ordsfras förekommer >3 ggr, tunna ut
  t = limitNgramRepeats(t, 4, 3);

  return t;
}

function limitNgramRepeats(text, n = 4, maxRepeats = 3) {
  const words = text.split(/\s+/);
  const seen = new Map();

  const keep = new Array(words.length).fill(true);
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(" ").toLowerCase();
    const c = (seen.get(gram) || 0) + 1;
    seen.set(gram, c);
    if (c > maxRepeats) {
      // Tunnar ut genom att flagga startordet i denna n-gram som borttaget
      keep[i] = false;
    }
  }
  const filtered = words.filter((_, idx) => keep[idx]);
  return filtered.join(" ");
}

function makeExcerpt(text, maxChars = 420) {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= maxChars) return t;
  // Klipp vid närmaste meningsslut före gränsen
  const cut = t.slice(0, maxChars);
  const lastPunct = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("?"), cut.lastIndexOf("!"));
  return lastPunct > 80 ? cut.slice(0, lastPunct + 1) : cut + "…";
}
