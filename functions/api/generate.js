// functions/api/generate.js
// BN textmotor med tydlig nivåskillnad (1–5) och anti-klyscha
// Kör Mistral: kräver Secret i Cloudflare Pages -> MISTRAL_API_KEY

export const onRequestPost = async ({ request, env }) => {
  try {
    const { idea = "", minutes = 5, spice = 2 } = await safeJson(request);

    if (typeof idea !== "string" || !idea.trim()) {
      return jsonError(400, "Tom idé. Skriv en kort beskrivning av scenen.");
    }
    const mins = Math.max(1, Math.min(15, Number(minutes) || 5));
    const lvl = Number(spice);
    if (![1,2,3,4,5].includes(lvl)) {
      return jsonError(400, "Ogiltig snusk-nivå (1–5).");
    }

    const MISTRAL_API_KEY = env.MISTRAL_API_KEY;
    if (!MISTRAL_API_KEY) {
      return jsonError(500, "Saknar MISTRAL_API_KEY i Cloudflare Pages → Settings → Variables & Secrets.");
    }

    const targetWords = Math.round(170 * mins);

    // ————— LEXIKON & STIL —————
    // OBS: nivå 5 använder explicit ordval men vi håller det vuxet, samtyckande och icke-grafiskt.
    const forbidden = [
      "minderår", "våld", "tvång", "incest", "drogning", "förnedring"
    ];

    const softLex = [ // ord som är okej/vanliga i 1–2
      "pirr", "värme", "smek", "kyss", "svalka", "doft", "närhet", "hud",
      "hans händer", "hennes läppar", "hjärtat slog", "andas nära"
    ];

    const hotLex = [ // 4–5 (används modererat i 4; tydligt i 5)
      "våt", "slicka", "tunga", "stötar", "hårt", "djupt",
      "skälvde", "ryckte till", "pulserade", "tryckte mig mot honom",
      "åtrå", "lust", "kåt", "orgasm", "kummen", "suget", "gripen om höfterna"
    ];

    const explicitLex = [ // 5 (explicit men ej grafiskt-anatomiskt)
      "kuk", "fitta", "knulla", "körde in", "trängde in", "reda henne med tungan",
      "rida", "kom för mig", "sprut", "slickade henne", "han tog mig bakifrån",
      "jag tog honom i munnen"
    ];

    // Stilprofiler per nivå
    const profiles = {
      1: {
        label: "nivå 1 – mild, romantisk, antydningar",
        temperature: 0.85, top_p: 0.92,
        mustUse: [], avoid: [...explicitLex, ...hotLex],
        rules: [
          "håll det lågmält, romantiskt, antydande",
          "undvik direkt sexuella ord och grovt språk",
          "fokus på blickar, beröring, stämning"
        ]
      },
      2: {
        label: "nivå 2 – varm, lätt erotik",
        temperature: 0.95, top_p: 0.92,
        mustUse: pick(softLex, 3), avoid: [...explicitLex],
        rules: [
          "naturligt sensuellt språk, mer direkta antydningar",
          "inga grova ord; samtycke tydligt"
        ]
      },
      3: {
        label: "nivå 3 – tydligt sensuell",
        temperature: 1.05, top_p: 0.9,
        mustUse: pick([...softLex, ...hotLex], 5), avoid: [],
        rules: [
          "direkt sensuellt språk, men inte rått",
          "variera uttryck och tempo; bygg upp till klimax runt 70–80%"
        ]
      },
      4: {
        label: "nivå 4 – het, explicit men elegant",
        temperature: 1.12, top_p: 0.9,
        mustUse: pick(hotLex, 6), avoid: [],
        rules: [
          "använd direkt erotiskt språk vuxet och respektfullt",
          "flera tydliga intima handlingar; inget grafiskt-kroppsdetaljerat"
        ]
      },
      5: {
        label: "nivå 5 – mycket het, explicit (icke-grafiskt)",
        temperature: 1.22, top_p: 0.9,
        // krav: minst 5 ord/fraser ur explicitLex + 4 ur hotLex
        mustUse: [...pick(explicitLex, 5), ...pick(hotLex, 4)],
        avoid: [],
        rules: [
          "självsäkert, vuxet, mycket hett språk – alltid samtycke och trygghet",
          "undvik grov anatomi-detalj eller kliniska termer; håll det stilfullt",
          "visa scener med handling/dialog, inte referat"
        ]
      }
    };

    const p = profiles[lvl];

    // Anti-klyscha-styrning
    const antiCliche = [
      "undvik upprepningar: inte samma fras eller metafor flera gånger",
      "variera synonymer och rytm; undvik klyschor",
      "använd sinnesintryck: doft, smak, känsel, ljud, blickar"
    ];

    const doNotSay = forbidden.concat(
      p.avoid.length ? ["följande ord är förbjudna i texten: " + p.avoid.join(", ")] : []
    );

    const mustLine = p.mustUse.length
      ? `Använd MINST ${p.mustUse.length} av följande uttryck naturligt i texten: ${p.mustUse.join(", ")}.`
      : "Undvik grovt språk. Inga explicit ord behövs.";

    const systemMsg = [
      "Du skriver på svenska sensuella vuxennoveller för uppläsning. Allt är samtycke mellan vuxna.",
      `Målslängd ≈ ${targetWords} ord (±10%).`,
      `Ton: ${p.label}.`,
      mustLine,
      ...p.rules.map((r) => "• " + r),
      ...antiCliche.map((r) => "• " + r),
      doNotSay.length ? "Förbjudet innehåll: " + doNotSay.join("; ") : "",
      "Följ lag och säkerhet. Inget minderårigt, inget tvång, inga skador."
    ].join("\n");

    const userMsg = [
      "Idé från användaren:",
      idea.trim(),
      "",
      "Skriv EN sammanhängande novell utan rubriker.",
      "Struktur: snabb krok → stegring → flera intima scener → klimax → varm avrundning."
    ].join("\n");

    // Timeout 50s
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);

    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
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
        max_tokens: Math.min(8192, Math.round(targetWords * 2.0)),
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: userMsg }
        ]
      })
    }).catch((e) => { clearTimeout(timeout); throw e; });

    clearTimeout(timeout);

    if (!res.ok) {
      const txt = await safeText(res);
      return jsonError(502, `Text-API svarade ${res.status}. ${truncate(txt, 400)}`);
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    if (!raw.trim()) {
      return jsonError(502, "Textgenereringen gav tomt svar. Testa ändra formuleringen.");
    }

    // Efterbearbetning
    let text = tidyText(raw, { level: lvl, must: p.mustUse, avoid: p.avoid });
    const excerpt = makeExcerpt(text, 420);

    return new Response(JSON.stringify({ ok: true, text, excerpt }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      status: 200
    });
  } catch (err) {
    const msg = err?.name === "AbortError" ? "Begäran avbröts (timeout)." : (err?.message || "Okänt fel i generate.");
    return jsonError(500, msg);
  }
};

/* ===== Hjälpfunktioner ===== */

async function safeJson(req){ try { return await req.json(); } catch { return {}; } }
async function safeText(res){ try { return await res.text(); } catch { return ""; } }

function jsonError(status, message){
  return new Response(JSON.stringify({ ok:false, error: message }), {
    status, headers: { "Content-Type":"application/json", "Cache-Control":"no-store" }
  });
}

function truncate(s,n){ return s && s.length>n ? s.slice(0,n-1)+"…" : s; }

function pick(arr, n){
  const a = [...arr]; const out=[];
  while (a.length && out.length<n){ out.push(a.splice(Math.floor(Math.random()*a.length),1)[0]); }
  return out;
}

function tidyText(input, { level, must=[], avoid=[] } = {}){
  let t = (input||"").trim();

  // Normalisera whitespace & radbrytningar
  t = t.replace(/\r/g,"").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n");

  // Ta bort direkt upprepade meningar
  t = t.replace(/(^|\n)([^.\n!?]{8,}[.!?])\s+\2/gm, "$1$2");

  // Tunnar ut repetitiva 4-ord fraser
  t = limitNgramRepeats(t, 4, 3);

  // Säkerställ nivåskillnad:
  //  - Om level 5: hintar in must-ord om väldigt få förekommer
  if (level === 5 && countAny(t, must) < Math.max(3, Math.floor(must.length*0.5))){
    t += "\n\n" + softInject(must, 3);
  }
  //  - Om level 1–2: ta bort explicit ord som råkat trilla in
  if (level <= 2 && avoid.length){
    const re = new RegExp("\\b(" + avoid.map(esc).join("|") + ")\\b","gi");
    t = t.replace(re, "—");
  }

  return t;
}

function limitNgramRepeats(text, n=4, maxRepeats=3){
  const words = text.split(/\s+/);
  const seen = new Map();
  const keep = new Array(words.length).fill(true);
  for (let i=0;i<=words.length-n;i++){
    const gram = words.slice(i,i+n).join(" ").toLowerCase();
    const c = (seen.get(gram)||0)+1; seen.set(gram,c);
    if (c>maxRepeats) keep[i]=false;
  }
  return words.filter((_,i)=>keep[i]).join(" ");
}

function countAny(text, list){
  const lower = text.toLowerCase();
  return list.reduce((acc, w)=> acc + (lower.includes(w.toLowerCase())?1:0), 0);
}
function softInject(words, n){
  return "Jag tappade räkningen på tiden när " + pick(words, n).join(", ") + ".";
}
function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }

function makeExcerpt(text, maxChars=420){
  const t = text.trim().replace(/\s+/g," ");
  if (t.length<=maxChars) return t;
  const cut = t.slice(0,maxChars);
  const last = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("?"), cut.lastIndexOf("!"));
  return last>80 ? cut.slice(0,last+1) : cut+"…";
}
