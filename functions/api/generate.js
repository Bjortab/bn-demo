// functions/api/generate.js
// BN textmotor med tre faktiska profiler (1=Mild, 3=Mellan, 5=Hett),
// men UI kan skicka 1–5. Vi "snäpper" till 1 / 3 / 5.
// Kräver: MISTRAL_API_KEY i Cloudflare Pages (Settings → Variables & Secrets).

export const onRequestPost = async ({ request, env }) => {
  try {
    const { idea = "", minutes = 5, level = 2 } = await safeJson(request);

    if (typeof idea !== "string" || !idea.trim()) {
      return jerr(400, "Tom idé. Skriv en kort beskrivning av scenen.");
    }
    const mins = clamp(Number(minutes) || 5, 1, 15);

    // ----- Snap 1–5 till 1/3/5 -----
    const ui = clamp(Number(level) || 2, 1, 5);
    const snapped = ui <= 1 ? 1 : (ui <= 3 ? 3 : 5);

    const MISTRAL_API_KEY = env.MISTRAL_API_KEY;
    if (!MISTRAL_API_KEY) return jerr(500, "Saknar MISTRAL_API_KEY.");

    const targetWords = Math.round(mins * 170);

    // ----- lexikon -----
    const forbiddenGlobal = ["minderår", "tvång", "våld", "incest", "drogning", "förnedring"];

    const SOFT = [
      "pirr", "värme", "smek", "kyss", "närhet", "hud", "dröjde med blicken",
      "andas nära", "hans händer", "hennes läppar", "hjärtat slog"
    ];

    const HOT = [
      "våt", "slicka", "tunga", "stötar", "hårt", "djupt", "skälvde",
      "ryckte till", "pulserade", "gripen om höfterna", "åtrå", "lust", "kåt",
      "orgasm", "suget"
    ];

    // Ditt önskade ord/fraser (explicit men ej grafiskt-kliniskt)
    const EXPLICIT = [
      "våta sköte", "lem", "han gled in i henne", "gled in och ut",
      "hon red honom", "ökade takten", "kom för mig", "han kom i mig",
      "han tog mig bakifrån", "jag tog honom i munnen", "han fyllde mig",
      "trängde in i mig", "jag red honom"
    ];

    // ----- profiler -----
    const profiles = {
      1: { // Mild (romantik/antydningar)
        label: "Mild – romantiskt, antydande",
        temperature: 0.8, top_p: 0.92,
        mustUse: pick(SOFT, 3),
        forbid: [...EXPLICIT, ...HOT], // inga explicita ord
        rules: [
          "håll det lågmält och romantiskt, arbeta med antydningar",
          "inga direkta sexuella ord, ingen penetration i beskrivning",
          "fokus på blickar, beröring, stämning, mjuk dialog"
        ]
      },
      3: { // Mellan (sensuell och tydlig men inte rå)
        label: "Mellan – sensuellt och tydligt",
        temperature: 1.05, top_p: 0.9,
        mustUse: pick([...SOFT, ...HOT], 5),
        forbid: [], // tillåtet med tydliga handlingar men håll god ton
        rules: [
          "sensuellt och tydligt, men inte rått",
          "variera uttryck och tempo; låt handling och dialog bära scenen",
          "bygg upp mot klimax runt 70–80% och avrunda varmt"
        ]
      },
      5: { // Hett (explicit men ej grafiskt-kliniskt)
        label: "Hett – mycket explicit, ej grafiskt",
        temperature: 1.18, top_p: 0.9,
        // krav: minst 6 från EXPLICIT + 5 från HOT
        mustUse: [...pick(EXPLICIT, 6), ...pick(HOT, 5)],
        forbid: [], // vi styr via reglerna istället
        rules: [
          // Scenkrav: leverera det du bad om
          "ha med penetration: fraser som 'han gled in i henne' eller 'trängde in'",
          "ha med rytm/tempo: 'gled in och ut', 'ökade takten', 'allt häftigare'",
          "ha med en 'rida'-scen: t.ex. 'hon red honom' (om det passar idén)",
          "bygga mot klimax och beskriv orgasm utan medicinskt språk",
          // Stilsäkerhet:
          "alltid vuxet och samtycke, respektfullt; inget våld/kränkning",
          "undvik kliniska anatomidetaljer; håll det naturligt, muntligt språk",
          "variera uttryck; undvik klyschor/upprepningar"
        ]
      }
    };

    const p = profiles[snapped];

    const antiCliche = [
      "undvik att upprepa samma fras eller metafor mer än en gång",
      "variera ordval och meningsrytm",
      "använd sinnen: doft, smak, känsel, ljud, blickar"
    ];

    const systemMsg = [
      "Du skriver svenska, vuxna, samtyckande sensuella noveller för uppläsning.",
      "Inga minderåriga, inget tvång, inget våld, inga släktingar, inget hat.",
      `Målslängd ≈ ${targetWords} ord (±10%).`,
      `Ton: ${p.label}.`,
      p.mustUse.length ? `Använd MINST ${p.mustUse.length} av dessa uttryck naturligt: ${p.mustUse.join(", ")}.` : "",
      p.forbid.length ? `Följande uttryck FÅR INTE förekomma: ${p.forbid.join(", ")}.` : "",
      ...p.rules.map(r => "• " + r),
      ...antiCliche.map(r => "• " + r),
      forbiddenGlobal.length ? "Förbjudet innehåll: " + forbiddenGlobal.join(", ") : ""
    ].filter(Boolean).join("\n");

    const userMsg = [
      "Idé från användaren:",
      idea.trim(),
      "",
      "Skriv EN sammanhängande novell utan rubriker/listor.",
      "Struktur: snabb krok → stegring → flera intima scener → klimax → varm avrundning."
    ].join("\n");

    // Timeout 55s (Cloudflare)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

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
      return jerr(502, `Text-API svarade ${res.status}. ${truncate(txt, 400)}`);
    }

    const data = await res.json();
    let text = (data?.choices?.[0]?.message?.content || "").trim();
    if (!text) return jerr(502, "Textgenereringen gav tomt svar.");

    // Efterbearbetning – minska upprepningar, säkra nivåskillnad
    text = tidyText(text, { snapped, must: p.mustUse, forbid: p.forbid });

    const excerpt = makeExcerpt(text, 420);
    return ok({ text, excerpt, snapped });

  } catch (err) {
    const msg = err?.name === "AbortError" ? "Begäran avbröts (timeout)." : (err?.message || "Okänt fel i generate.");
    return jerr(500, msg);
  }
};

/* ===== Hjälpfunktioner ===== */

function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
async function safeJson(req){ try { return await req.json(); } catch { return {}; } }
async function safeText(res){ try { return await res.text(); } catch { return ""; } }

function ok(obj){ return new Response(JSON.stringify({ ok:true, ...obj }), { status:200, headers:jsonHeaders() }); }
function jerr(status, message){ return new Response(JSON.stringify({ ok:false, error:message }), { status, headers:jsonHeaders() }); }
function jsonHeaders(){ return { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", "Access-Control-Allow-Origin":"*" }; }

function truncate(s,n){ return s && s.length>n ? s.slice(0,n-1)+"…" : s; }

function pick(arr, n){
  const a = [...arr]; const out = [];
  while (a.length && out.length < n) {
    out.push(a.splice(Math.floor(Math.random()*a.length),1)[0]);
  }
  return out;
}

function tidyText(input, { snapped, must = [], forbid = [] } = {}){
  let t = (input||"").trim();

  // Normalisering
  t = t.replace(/\r/g,"").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n");

  // Ta bort samma mening upprepad direkt
  t = t.replace(/(^|\n)([^.\n!?]{8,}[.!?])\s+\2/gm, "$1$2");

  // Tunna ut repetitiva 4-ordsfraser
  t = limitNgramRepeats(t, 4, 3);

  // Säkra nivåskillnad:
  if (snapped === 1 && forbid.length){ // ta bort explicita uttryck som råkat trilla in
    const re = new RegExp("\\b(" + forbid.map(esc).join("|") + ")\\b","gi");
    t = t.replace(re, "—");
  }
  if (snapped === 5 && countAny(t, must) < Math.max(5, Math.floor(must.length*0.6))){
    // injicera en naturlig rad som gör att fler must-ord dyker upp
    t += "\n\n" + softInject(must, 4);
  }

  return t.trim();
}

function limitNgramRepeats(text, n=4, maxRepeats=3){
  const words = text.split(/\s+/);
  const seen = new Map(); const keep = new Array(words.length).fill(true);
  for (let i=0;i<=words.length-n;i++){
    const gram = words.slice(i,i+n).join(" ").toLowerCase();
    const c = (seen.get(gram)||0)+1; seen.set(gram,c);
    if (c>maxRepeats) keep[i] = false;
  }
  return words.filter((_,i)=>keep[i]).join(" ");
}

function countAny(text, list){
  const lower = text.toLowerCase();
  return list.reduce((acc,w)=> acc + (lower.includes(w.toLowerCase())?1:0), 0);
}

function softInject(words, n){
  return "Jag tappade räkningen när " + pick(words, n).join(", ") + " tog över och tempot steg.";
}

function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }

function makeExcerpt(text, maxChars=420){
  const t = text.trim().replace(/\s+/g," ");
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const last = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("?"), cut.lastIndexOf("!"));
  return last>80 ? cut.slice(0,last+1) : cut+"…";
}
