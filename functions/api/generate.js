// /functions/api/generate.js
// Kumulativ ordlista: nivå N använder level1..levelN
// Tvingar ett visst antal ord/fraser från AKTUELL nivå så att 1–5 känns tydligt olika.

const WORDS_PER_MIN = 170;

export async function onRequestPost({ request, env }) {
  try {
    const { idea = "", minutes = 5, level = 2 } = await readJson(request);
    const concept = String(idea || "").trim();
    if (!concept) return j({ ok:false, error:"empty_idea" }, 400);

    const min = clamp(Number(minutes)||5, 1, 15);
    const lvl = clamp(Number(level)||2, 1, 5);

    // Längdmål
    const targetWords = Math.round(min * WORDS_PER_MIN);
    const minWords = Math.max(220, Math.round(targetWords * 0.9));
    const maxWords = Math.round(targetWords * 1.15);

    // Hämta lexicon.json från origin (rotmappen)
    const origin = new URL(request.url).origin;
    const lex = await loadLexicon(`${origin}/lexicon.json?v=${Date.now()}`);

    // Normalisera nivålistor
    const L = {
      1: norm(lex.level1),
      2: norm(lex.level2),
      3: norm(lex.level3),
      4: norm(lex.level4),
      5: norm(lex.level5)
    };

    // Bygg kumulativ lista (nivå N = 1..N)
    const LCUM = {
      1: L[1],
      2: dedup([...L[1], ...L[2]]),
      3: dedup([...L[1], ...L[2], ...L[3]]),
      4: dedup([...L[1], ...L[2], ...L[3], ...L[4]]),
      5: dedup([...L[1], ...L[2], ...L[3], ...L[4], ...L[5]])
    };

    const tone = {
      1: "mycket mild, romantisk, antydande. Inga explicita ord.",
      2: "mild sensualism, varm stämning, diskret språk.",
      3: "tydligt sensuell men icke-grafisk. Variation i ordval och tempo.",
      4: "hett språk, vuxna teman, ändå icke-grafiskt beskrivet.",
      5: "mest intensiv och direkt; använd många uttryck ur NIVÅ 5 naturligt, och valfritt från lägre nivåer."
    }[lvl];

    const outline = [
      "Scen & stämning: var, när, hur känns luften/ljuset/ljudet.",
      "Första kontakten och varför de dras till varandra.",
      "Stegring: blickar, beröringar, ord; tempot ökar successivt.",
      "Hett crescendo: växla meningslängd så rytmen märks; håll sammanhang.",
      "Avtoning: lugn efterklang och en tydlig slutmening."
    ];

    // Hur många “måste-vad”?
    const mustPrimary = (lvl>=5 ? 6 : lvl>=4 ? 4 : 2);    // från AKTUELL nivå
    const mustTotal   = mustPrimary + (lvl>=3 ? 2 : 0);   // totalt från kumulativa (ger variation utan att späda ut nivån)

    // Bygg system + user-prompt
    const system = [
      "Du skriver på SVENSKA kortnoveller för uppläsning.",
      "Alltid vuxna & samtycke. Ingen skada, inget tvång, inga minderåriga.",
      "Håll person & tempus konsekvent. Undvik upprepningar & klichéer.",
      `Sikta på ${minWords}-${maxWords} ord.`,
      `Nivå ${lvl}: ${tone}`
    ].join(" ");

    const user = [
      `IDÉ: ${concept}`,
      `Disposition:\n- ${outline.join("\n- ")}`,
      levelBlock("Primär nivålista (måste använda)", L[lvl]),
      levelBlock("Kumulativ lista (valfri variation)", LCUM[lvl]),
      `Använd minst ${mustPrimary} uttryck från PRIMÄR lista och totalt minst ${mustTotal} från PRIMÄR + KUMULATIV.`,
      "Skriv sammanhängande prosa (ingen lista/rubriker) och avsluta med en tydlig, lugn slutmening."
    ].join("\n");

    // ——— Anropa modell (Mistral om finns, annars OpenAI)
    const useMistral = Boolean(env.MISTRAL_API_KEY);
    let text = "", used = useMistral ? "mistral" : "openai";

    if (useMistral) {
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method:"POST",
        headers:{ "Authorization":`Bearer ${env.MISTRAL_API_KEY}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"mistral-large-latest",
          temperature:(lvl>=4?1.0:0.9),
          max_tokens: 2048,
          messages:[
            { role:"system", content: system },
            { role:"user", content: user }
          ]
        })
      });
      if (!r.ok) return j({ ok:false, error:"mistral_error", detail: await r.text().catch(()=> "") }, 502);
      const data = await r.json();
      text = (data.choices?.[0]?.message?.content || "").trim();
    } else {
      if (!env.OPENAI_API_KEY) return j({ ok:false, error:"missing_openai_key" }, 500);
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method:"POST",
        headers:{ "Authorization":`Bearer ${env.OPENAI_API_KEY}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"gpt-4o-mini",
          temperature:(lvl>=4?1.0:0.9),
          max_tokens: 2048,
          messages:[
            { role:"system", content: system },
            { role:"user", content: user }
          ]
        })
      });
      if (!r.ok) return j({ ok:false, error:"openai_error", detail: await r.text().catch(()=> "") }, 502);
      const data = await r.json();
      text = (data.choices?.[0]?.message?.content || "").trim();
    }

    if (!text) return j({ ok:false, error:"empty_text" }, 502);

    // ——— Efterkontroll: räkna träffar
    const primary = L[lvl] || [];
    const combo   = LCUM[lvl] || [];
    const lower   = combo.filter(w => !primary.includes(w));

    const lowerCount = countHits(text, lower);
    const primCount  = countHits(text, primary);

    // Säkerställ minimi
    if (primCount < mustPrimary) {
      const missingPrim = missingFrom(text, primary, mustPrimary - primCount);
      if (missingPrim.length) {
        text += (/[.!?…]$/.test(text) ? " " : ". ") +
          `I närheten växte också nyanser av ${missingPrim.join(", ")} fram.`;
      }
    }
    const totalNow = countHits(text, combo);
    if (totalNow < mustTotal) {
      const missingMix = missingFrom(text, combo, mustTotal - totalNow);
      if (missingMix.length) {
        text += (/[.!?…]$/.test(text) ? " " : ". ") +
          `Rytmen bar spår av ${missingMix.join(", ")} medan de lät stunden klinga ut.`;
      }
    }

    // Trimma längd + säkerställ slut
    const words = text.split(/\s+/);
    if (words.length > (maxWords + 40)) text = words.slice(0, maxWords).join(" ");
    if (!/[.!?…]$/.test(text)) text += ".";
    text += " När andetagen stillnat delade de ett tyst leende och lät värmen klinga ut.";

    return j({ ok:true, text, model: used }, 200);

  } catch (err) {
    return j({ ok:false, error:"server_error", detail: String(err?.message||err) }, 500);
  }
}

// ——— helpers ———
function j(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      "access-control-allow-origin":"*"
    }
  });
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
async function readJson(req){ try { return await req.json(); } catch { return {}; } }

async function loadLexicon(url){
  try{
    const r = await fetch(url, { cf:{ cacheTtl:0 } });
    if (!r.ok) return { level1:[], level2:[], level3:[], level4:[], level5:[] };
    const j = await r.json();
    return {
      level1: Array.isArray(j.level1) ? j.level1 : [],
      level2: Array.isArray(j.level2) ? j.level2 : [],
      level3: Array.isArray(j.level3) ? j.level3 : [],
      level4: Array.isArray(j.level4) ? j.level4 : [],
      level5: Array.isArray(j.level5) ? j.level5 : []
    };
  }catch{ return { level1:[], level2:[], level3:[], level4:[], level5:[] }; }
}

function norm(arr){ return (Array.isArray(arr)?arr:[]).map(s=>String(s||"").trim()).filter(Boolean); }
function dedup(arr){ return Array.from(new Set(arr.map(s=>s.toLowerCase()))); }
function countHits(text, list){
  const lower = text.toLowerCase();
  return list.reduce((n,w)=> n + (lower.includes(String(w).toLowerCase()) ? 1 : 0), 0);
}
function missingFrom(text, list, need){
  const lower = text.toLowerCase();
  const miss = [];
  for (const w of list) {
    if (!lower.includes(String(w).toLowerCase())) miss.push(w);
    if (miss.length >= need) break;
  }
  return miss;
}

function levelBlock(title, items){
  if (!items || !items.length) return `${title}: (ingen lista tillhandahållen)`;
  // Korta listor i prompten för att undvika överladdning: caps 60 uttryck
  const cap = items.slice(0, 60);
  return `${title}: ${cap.join(", ")}`;
}
