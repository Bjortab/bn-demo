// /functions/api/generate.js – hård nivåstyrning + anti-kärlek + tidig handling + injektion

export const onRequestPost = async ({ request, env }) => {
  try {
    const { idea = "", minutes = 5, level = 2 } = await request.json();

    const lvl = clamp(Number(level), 1, 5);
    const mins = clamp(Number(minutes), 1, 15);
    if (!idea.trim()) return J({ ok:false, error:"empty_idea" }, 400);
    if (!env.MISTRAL_API_KEY) return J({ ok:false, error:"missing_mistral_key" }, 500);

    // Ordlistor per nivå
    const L1 = [
      "kramade om","höll handen","såg djupt i ögonen","värme spreds i kroppen","log blygt",
      "en mjuk kyss på kinden","deras fingrar nuddades","smekte hans hår","hjärtat bultade",
      "deras läppar möttes försiktigt","pannorna möttes","trygg i hans famn"
    ];
    const L2 = [
      "djupa kyssar","hans händer över hennes hud","varm andning mot halsen","hon drog honom närmare",
      "fingrar som följde kurvor","deras andetag blev tyngre","längtan i kroppen","nervpirr i magen"
    ];
    const L3 = [
      "hans hand längs hennes lår","deras tungor möttes","hon bet sig i läppen","hans kyssar blev våtare",
      "hennes kropp svarade på beröringen","rytm som byggdes upp","ett lågt stön mot hans mun","han drog efter andan"
    ];
    const L4 = [
      "hans lem mot hennes sköte","våt mellan låren","slickade hennes bröstvårta",
      "han trängde in långsamt","hon red honom","stöt för stöt","han kom","hon kom",
      "pulserande njutning","rytmen blev hårdare"
    ];
    const L5 = [
      "hans kuk gled in i hennes fitta","hennes fitta var slickblöt","han knullade henne hårt",
      "hon red honom tills benen skakade","hans tunga på hennes klitoris",
      "hon sprutade över hans haka","han tog henne bakifrån","hon sög hans kuk djupt",
      "han kom hårt i henne","hennes fitta pulserade runt honom","hon gned sig fortare",
      "han höll om hennes höfter och gav efter","hon skrek till när han fyllde henne"
    ];

    // Regex-stammar för explicithet
    const STEMS_EXPL = [
      /kuk\w*/i, /fitt\w*/i, /slid\w*/i, /sköt\w*/i, /lem\w*/i,
      /slick\w*/i, /knull\w*/i, /penetr\w*/i, /träng\w*/i, /rid\w*/i,
      /stöt\w*/i, /ollon\w*/i, /sprut\w*/i, /orgasm\w*/i, /\bkom(\b|ma|mit)\b/i
    ];

    // Anti-kärlek 4–5
    const BAN_LOVE = [
      "kärlek","älskade","själsfrände","för evigt","evig kärlek","romans",
      "livets stora kärlek","kärleksförklaring","evigt tillsammans"
    ];

    // Mildare nivåer: förbjud grovt
    const FORBID_RAW_12 = ["kuk","fitta","knulla","ollon","spruta","sprutade","trängde","slickade"];
    const REPL_12 = { "kuk":"lem","fitta":"sköte","knulla":"älska","ollon":"spetsen","spruta":"komma","sprutade":"kom","trängde":"nuddade","slickade":"smekte" };
    const REPL_3  = { "kuk":"lem","fitta":"sköte","knulla":"tog henne" };

    const targetWords = Math.max(180, Math.min(900, Math.round(mins * 170)));

    const system = buildSystem(lvl, targetWords, { L1, L2, L3, L4, L5 });
    const user = [
      `Idé: ${idea.trim()}`,
      "Skriv i ett stycke, idiomatisk svenska för högläsning.",
      "Variera meningslängd; inkludera 1–3 korta repliker.",
      "Avsluta utan romantisk deklaration; landa i andhämtning."
    ].join("\n");

    // 60s timeout
    const signal = AbortSignal.timeout(60000);

    // Anropa Mistral
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.MISTRAL_API_KEY}`, "Content-Type":"application/json" },
      body: JSON.stringify({
        model: lvl >= 4 ? "mistral-large-latest" : "mistral-small-latest",
        temperature: lvl <= 2 ? 0.7 : 0.95,
        top_p: 0.95,
        max_tokens: 1800,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      }),
      signal
    });
    if (!r.ok) return J({ ok:false, error:"mistral_failed", status:r.status, details: await r.text().catch(()=> "") }, 502);

    let text = (await r.json())?.choices?.[0]?.message?.content?.trim() || "";
    if (!text) return J({ ok:false, error:"empty_text" }, 502);

    text = tidy(text);

    // Efterbearbetning
    let debug = { level:lvl, stemHitsBefore:0, injected:0, loveRemoved:0, bansApplied:0, early:false };

    if (lvl >= 4) {
      const resLove = hardBan(text, BAN_LOVE, { "kärlek":"åtrå","älskade":"du","romans":"möte" });
      text = resLove.out; debug.loveRemoved = resLove.count;
    }

    if (lvl <= 2) {
      const res = hardBan(text, FORBID_RAW_12, REPL_12);
      text = res.out; debug.bansApplied = res.count;
      text = enrich(text, lvl === 1 ? L1 : L2, 3);
    } else if (lvl === 3) {
      const res = hardBan(text, ["kuk","fitta","knulla"], REPL_3);
      text = res.out; debug.bansApplied = res.count;
      text = enrich(text, L3, 2);
    } else {
      // 4–5: kräva tidig handling + explicita stammar
      const first8 = getFirstNSentences(text, 8).join(" ");
      const earlyHits = countStemHits(first8, STEMS_EXPL);
      if (lvl === 5 && earlyHits < 1) {
        const opener = "Dörren slog igen bakom oss. Hon drog ner mig i soffan, pressade sig mot mig och lät handen glida målmedvetet.";
        text = injectAtStart(text, ensurePeriod(opener));
        debug.early = true;
      }
      debug.stemHitsBefore = countStemHits(text, STEMS_EXPL);
      const need = (lvl === 5) ? 8 : 4;
      if (debug.stemHitsBefore < need) {
        const pool = lvl === 5 ? [...L5, ...L4] : [...L4, ...L3];
        const toAdd = need - debug.stemHitsBefore;
        text = injectSentences(text, choose(pool, toAdd));
        debug.injected = toAdd;
      }
      text = limitRepeats(text, 4, 3);
    }

    const excerpt = excerptOf(text, 420);
    return J({ ok:true, text, excerpt, debug }, 200);

  } catch (e) {
    const msg = e?.name === "TimeoutError" ? "timeout" : String(e);
    return J({ ok:false, error:"server_error", detail: msg }, 500);
  }
};

// ------- helpers -------
function J(obj, status=200){ return new Response(JSON.stringify(obj), { status, headers:{ "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" } }); }
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function tidy(s){ return String(s).replace(/\r/g,"").replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim(); }
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
function enrich(text, list, n=2){ return injectSentences(text, choose(list, n)); }
function choose(arr, n){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a.slice(0, Math.max(0, Math.min(n, a.length))); }

function splitSentences(txt){
  const parts = txt.split(/([.!?…]+)\s+/);
  const out=[]; for(let i=0;i<parts.length;i+=2){ const s=(parts[i]||"").trim(); const p=(parts[i+1]||".").trim(); if(s) out.push(s+(p||".")); }
  return out;
}
function getFirstNSentences(txt,n){ return splitSentences(txt).slice(0, Math.max(0,n)); }
function injectAtStart(txt, opening){ const s=splitSentences(txt); s.unshift(opening); return s.join(" "); }
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
  const lc = (txt||"").toLowerCase(); const set = new Set();
  for (const re of regexes){ if (re.test(lc)) set.add(re.source); }
  return set.size;
}
function limitRepeats(text, n=4, max=3){
  const words = text.split(/\s+/); const seen = new Map(); const keep = new Array(words.length).fill(true);
  for (let i=0;i<=words.length-n;i++){
    const gram = words.slice(i,i+n).join(" ").toLowerCase();
    const c=(seen.get(gram)||0)+1; seen.set(gram,c);
    if (c>max) keep[i]=false;
  }
  return words.filter((_,i)=>keep[i]).join(" ");
}

function buildSystem(level, targetWords, { L1, L2, L3, L4, L5 }){
  const guard =
    "Allt är mellan vuxna (18+) och samtyckande. Inga minderåriga. Inget tvång eller våld. " +
    "Skriv idiomatisk svenska för högläsning, undvik klyschor/upprepning. " +
    `Längd ≈ ${targetWords} ord (±15%).`;

  if (level <= 1) {
    return [
      "Du skriver oskyldigt romantiska, antydande noveller på svenska.",
      guard,
      "Ton: mjuk, blygt laddad, fokus på blickar/beröring över tyg. Ingen explicit anatomi.",
      "Använd gärna: " + L1.join(", ") + "."
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
  return [
    "Du skriver mycket heta, explicita noveller på svenska.",
    guard,
    "Ton: rå lust och tempo, inga kärleksdeklarationer. Snabb start mot handling.",
    "Inkludera kort dialog och tydliga kroppsliga detaljer.",
    "Använd många uttryck ur: " + L5.join(", ") + ".",
    "Avsluta utan romantiskt efterspel – landa i puls/andhämtning."
  ].join("\n");
}
