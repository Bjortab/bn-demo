// functions/api/generate.js
// BN – hård nivåstyrning (1..5), tidig handling för 5, anti-"kärlek" på 4–5,
// explicit-check + injektion vid behov. CommonJS för Cloudflare Pages.

module.exports = {
  async onRequestPost({ request, env }) {
    try {
      const body = await request.json().catch(() => ({}));
      const idea = String(body?.idea || "").trim();
      const minutes = clamp(Number(body?.minutes || 5), 1, 15);
      const level = clamp(Number(body?.level || 2), 1, 5);

      if (!idea) return J({ ok: false, error: "empty_idea" }, 400);
      if (!env.MISTRAL_API_KEY) return J({ ok: false, error: "missing_mistral_key" }, 500);

      // — Ordbanker —
      const L1 = [
        "kramade om","höll handen","såg djupt i ögonen","värme spreds i kroppen","log blygt",
        "en mjuk kyss på kinden","deras fingrar nuddades","smekte hans hår","hjärtat bultade",
        "ett leende växte fram","deras läppar möttes försiktigt","pannorna möttes","trygg i hans famn"
      ];
      const L2 = [
        "djupa kyssar","hans händer över hennes hud","varm andning mot halsen","hon drog honom närmare",
        "fingrar som följde kurvor","deras andetag blev tyngre","längtan i kroppen","nervpirr i magen"
      ];
      const L3 = [
        "hans hand längs hennes lår","deras tungor möttes","hon bet sig i läppen","hans kyssar blev våtare",
        "hennes kropp svarade på beröringen","rytm som byggdes upp","ett lågt stön mot hans mun",
        "hon pressade sig närmare","han drog efter andan"
      ];
      const L4 = [
        "hans lem mot hennes sköte","våt mellan låren","slickade hennes bröstvårta",
        "han trängde in långsamt","hon red honom","stöt för stöt","han kom","hon kom",
        "pulserande njutning","rytmen blev hårdare","hon höll om hans höfter"
      ];
      const L5 = [
        "hans kuk gled in i hennes fitta","hennes fitta var slickblöt","han knullade henne hårt",
        "hon red honom tills benen skakade","hans tunga på hennes klitoris",
        "hon sprutade över hans haka","han tog henne bakifrån","hon sög hans kuk djupt",
        "han kom hårt i henne","hennes fitta pulserade runt honom","hon gned sig fortare",
        "han höll om hennes höfter och gav efter","hon skrek till när han fyllde henne"
      ];

      // Fångar explicita stammar (räknar unika träffar)
      const STEMS_EXPL = [
        /kuk\w*/i, /fitt\w*/i, /slid\w*/i, /sköt\w*/i, /lem\w*/i,
        /slick\w*/i, /knull\w*/i, /penetr\w*/i, /träng\w*/i, /rid\w*/i,
        /stöt\w*/i, /ollon\w*/i, /sprut\w*/i, /orgasm\w*/i, /\bkom(\b|ma|mit)\b/i
      ];

      // Ord som inte ska förekomma på 4–5 (anti-kärlek / lång romans)
      const BAN_LOVE = [
        "kärlek","älskade","själsfrände","för evigt","evig kärlek","romans",
        "livets stora kärlek","kärleksförklaring","evigt tillsammans"
      ];

      // Grova ord som rensas/tonas ner i 1–2 (och delvis 3)
      const FORBID_RAW_12 = ["kuk","fitta","knulla","ollon","spruta","sprutade","trängde","slickade"];
      const REPLACE_12 = { "kuk":"lem","fitta":"sköte","knulla":"älska","ollon":"spetsen","spruta":"komma","sprutade":"kom","trängde":"nuddade","slickade":"smekte" };
      const REPLACE_3  = { "kuk":"lem","fitta":"sköte","knulla":"tog henne" };

      const targetWords = Math.max(180, Math.min(900, Math.round(minutes * 170)));

      // — Systemprompt (nivåspecifik stilguide) —
      const system = buildSystem(level, targetWords, { L1, L2, L3, L4, L5 });

      // — Användarinstruktion med struktur/tempo —
      const user = [
        `Idé: ${idea}`,
        "Skriv som en sammanhängande berättelse i ett stycke, idiomatisk svenska för högläsning.",
        "Variera meningslängd; blanda korta rader vid upptrappning med längre kroppsliga bilder.",
        "Inkludera minst 2 repliker (kort dialog) med naturliga replikmarkörer.",
        "Inga rubriker, inget efterord. Avsluta på en ton av andhämtning/lugn, inte kärleksförklaring."
      ].join("\n");

      // — Mistral —
      const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.MISTRAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: level >= 4 ? "mistral-large-latest" : "mistral-small-latest",
          temperature: level <= 2 ? 0.7 : 0.95,
          top_p: 0.95,
          max_tokens: 1800,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });
      if (!resp.ok) return J({ ok:false, error:"mistral_failed", status: resp.status, details: await safeText(resp) }, 502);

      let text = ((await resp.json())?.choices?.[0]?.message?.content || "").trim();
      if (!text) return J({ ok:false, error: "empty_text" }, 502);

      text = tidy(text);

      // — Efterbearbetning / enforcement —
      let debug = { level, targetWords, stemHitsBefore: 0, injected: 0, bansApplied: 0, loveRemoved: 0, earlyActionAdded: false };

      // 4–5: ta bort kärleksprat
      if (level >= 4) {
        const resLove = hardBan(text, BAN_LOVE, { "kärlek":"åtrå", "älskade":"du", "romans":"möte" });
        text = resLove.out; debug.loveRemoved = resLove.count;
      }

      if (level <= 2) {
        // rensa rått språk
        const res = hardBan(text, FORBID_RAW_12, REPLACE_12);
        text = res.out; debug.bansApplied = res.count;
        text = enrich(text, level === 1 ? L1 : L2, 3);
      } else if (level === 3) {
        const res = hardBan(text, ["kuk","fitta","knulla"], REPLACE_3);
        text = res.out; debug.bansApplied = res.count;
        text = enrich(text, L3, 2);
      } else {
        // 4–5: kräva explicithet + tidig handling
        debug.stemHitsBefore = countStemHits(text, STEMS_EXPL);

        // Säkerställ tidig handling – inom första 6–8 meningarna ska något konkret ske
        const first8 = getFirstNSentences(text, 8).join(" ");
        const earlyHits = countStemHits(first8, STEMS_EXPL);
        if (earlyHits < 1) {
          // Prependa en kort, konkret öppning
          const opener = (level === 5)
            ? "Dörren stängdes bakom oss. Hon drog ner mig i soffan, lät handen glida beslutsamt och tryckte sig mot mig. Värmen slog till direkt; vi var redan överens utan ord."
            : "Vi stod nära, andetagen i otakt, hennes hand över min. När hon pressade sig närmare försvann tvekan och allting lutade framåt.";
          text = injectAtStart(text, ensurePeriod(opener));
          debug.earlyActionAdded = true;
        }

        // Tvinga in tillräckligt många explicita stammar totalt
        const need = (level === 5) ? 8 : 4;
        let count = countStemHits(text, STEMS_EXPL);
        if (count < need) {
          const pool = level === 5 ? [...L5, ...L4] : [...L4, ...L3];
          const toAdd = need - count;
          text = injectSentences(text, choose(pool, toAdd));
          debug.injected = toAdd;
        }

        // Begränsa för korta fraser som upprepas
        text = limitRepeats(text, 4, 3);
      }

      const excerpt = excerptOf(text, 420);
      return J({ ok:true, text, excerpt, debug }, 200);

    } catch (e) {
      return J({ ok:false, error:"server_error", message:String(e) }, 500);
    }
  }
};

// — Helpers —
function J(obj, status=200){ return new Response(JSON.stringify(obj), { status, headers:{ "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" } }); }
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function tidy(s){ return String(s).replace(/\r/g,"").replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim(); }
async function safeText(r){ try{return await r.text();}catch{return"";} }
function excerptOf(t,max){ return t.length<=max ? t : t.slice(0,max).replace(/\s+\S*$/,"")+"…"; }

function ensurePeriod(s){ return /[.!?…]$/.test(s.trim()) ? s.trim() : s.trim() + "."; }

function hardBan(text, terms, replMap={}) {
  let out = text, count = 0;
  for (const raw of terms) {
    const re = new RegExp(String(raw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, (m) => { count++; const key=m.toLowerCase(); return replMap[key] ?? ""; });
  }
  return { out, count };
}

function enrich(text, list, n=2){
  if (!list?.length || n<=0) return text;
  return injectSentences(text, choose(list, n));
}

function choose(arr, n){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

function splitSentences(txt){
  const parts = txt.split(/([.!?…]+)\s+/);
  const out = [];
  for (let i=0;i<parts.length;i+=2){
    const s=(parts[i]||"").trim();
    const p=(parts[i+1]||".").trim();
    if (s) out.push(s + (p || "."));
  }
  return out;
}
function getFirstNSentences(txt, n){
  return splitSentences(txt).slice(0, Math.max(0,n));
}
function injectAtStart(txt, opening){
  const sents = splitSentences(txt);
  sents.unshift(opening);
  return sents.join(" ");
}
function injectSentences(text, injections){
  if (!injections?.length) return text;
  const sents = splitSentences(text);
  const step = Math.max(1, Math.floor(sents.length / (injections.length + 1)));
  let idx = step;
  for (const inj of injections){
    const sentence = ensurePeriod(inj);
    sents.splice(Math.min(idx, sents.length), 0, sentence);
    idx += step;
  }
  return sents.join(" ");
}
function countStemHits(txt, regexes){
  const lc = (txt||"").toLowerCase();
  const set = new Set();
  for (const re of regexes){ if (re.test(lc)) set.add(re.source); }
  return set.size;
}
function limitRepeats(text, n=4, max=3){
  const words = text.split(/\s+/);
  const seen = new Map(); const keep = new Array(words.length).fill(true);
  for (let i=0;i<=words.length-n;i++){
    const gram = words.slice(i,i+n).join(" ").toLowerCase();
    const c=(seen.get(gram)||0)+1; seen.set(gram,c);
    if (c>max) keep[i]=false;
  }
  return words.filter((_,i)=>keep[i]).join(" ");
}

function buildSystem(level, targetWords, { L1, L2, L3, L4, L5 }){
  const guard =
    "Allt är mellan vuxna (18+) och samtyckande. Inga minderåriga, inget tvång, inget våld. " +
    "Skriv idiomatisk svenska för högläsning. Undvik klyschor och upprepningar. " +
    `Längd ≈ ${targetWords} ord (±15%).`;

  if (level <= 1) {
    return [
      "Du skriver oskyldigt romantiska, antydande noveller på svenska.",
      guard,
      "Ton: mjuk, blygt laddad, fokus på blickar/beröring över tyg. Ingen explicit anatomi.",
      "Använd gärna: " + L1.join(", ") + ".",
      "Ingen grov vokabulär, ingen hård sexbeskrivning."
    ].join("\n");
  }
  if (level === 2) {
    return [
      "Du skriver milda, varma noveller på svenska.",
      guard,
      "Ton: kyssar och händer över hud, sensuell närvaro, men undvik råa termer.",
      "Använd gärna: " + L2.join(", ") + "."
    ].join("\n");
  }
  if (level === 3) {
    return [
      "Du skriver tydligt sensuella noveller på svenska, utan råa ord.",
      guard,
      "Ton: kroppsligt och närvarande, en växande rytm, elegans före råhet.",
      "Använd gärna: " + L3.join(", ") + "."
    ].join("\n");
  }
  if (level === 4) {
    return [
      "Du skriver heta, explicita noveller på svenska (vuxet språk).",
      guard,
      "Ton: åtrå och kropp, konkret handling. Undvik ord om 'kärlek/romans'.",
      "Använd flera uttryck ur: " + L4.join(", ") + ".",
      "Inled med närhet och övergå till fysisk handling första tredjedelen."
    ].join("\n");
  }
  // level 5
  return [
    "Du skriver mycket heta, explicita noveller på svenska.",
    guard,
    "Ton: rå lust och tempo, inga kärleksdeklarationer. Snabb start mot handling.",
    "Inkludera kort dialog och tydliga kroppsliga detaljer.",
    "Använd många uttryck ur: " + L5.join(", ") + ".",
    "Avsluta utan romantiskt efterspel – landa i puls/andhämtning."
  ].join("\n");
}
