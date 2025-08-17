// /functions/api/generate.js
// BN – nivåstyrning 1..5, “klitoris” endast på 5, stora frasbibliotek genererade
// dynamiskt (50+ per nivå), anti-kliché (konfigurerbar), tidig handling på 5,
// explicit-stamkontroll + injektion, 60s timeout.

export const onRequestPost = async ({ request, env }) => {
  try {
    const { idea = "", minutes = 5, level = 2 } = await request.json();

    const lvl = clamp(Number(level), 1, 5);
    const mins = clamp(Number(minutes), 1, 15);

    if (!idea.trim()) return J({ ok:false, error:"empty_idea" }, 400);
    if (!env.MISTRAL_API_KEY) return J({ ok:false, error:"missing_mistral_key" }, 500);

    // ————————————————————————————————————————————————————————————————
    // 1) Lexikon (syntetiskt): generera 50+ fraser/ nivå
    //    * L4 exkluderar all klitoris-vokabulär
    //    * L5 inkluderar klitoris och grövre varianter
    // ————————————————————————————————————————————————————————————————
    const L1 = makeLexicon({
      cores: [
        "kramade om", "höll handen", "såg djupt i ögonen", "en mjuk kyss",
        "deras fingrar nuddades", "smekte hans hår", "hjärtat bultade",
        "deras läppar möttes försiktigt", "pannorna möttes", "ett blygt skratt",
        "hans röst blev mjukare", "hennes hand stannade kvar", "värmen i rummet",
        "ett tryggt ja i blicken", "andas i samma takt", "delade filt i soffan",
        "jag följde konturen av hennes kind", "vår tystnad var bekväm",
        "ett ögonblick utan brådska", "hon bet sig i läppen och log",
        "han vilade handen på min rygg", "en kyss över pannan", "en lätt rodnad",
        "mjuka ord i mörkret", "ett försiktigt närmande"
      ],
      intensifiers: ["lätt", "försiktigt", "lugnt", "mjukt", "varmt", "nära", "fint", "tyst"],
      suffixes: ["i soffan", "vid fönstret", "i hallen", "under filten", "i kvällsljus", "i köket"],
      minCount: 56
    });

    const L2 = makeLexicon({
      cores: [
        "djupa kyssar", "varm andning mot halsen", "hans händer över hennes hud",
        "hon drog honom närmare", "fingrar som följde kurvor", "deras andetag blev tyngre",
        "längtan i kroppen", "nervpirr i magen", "läppar som inte ville släppa",
        "hans hand längs midjan", "hon pressade sig närmare", "hud mot tyg",
        "han drog efter andan", "en viskning mot örat", "ett lågt stön",
        "han kysste hennes nacke", "hon öppnade försiktigt hans skjorta"
      ],
      intensifiers: ["långsamt", "närmare", "mjukare", "varmare", "längre", "ivrare"],
      suffixes: ["i dörröppningen", "mot väggen", "vid diskbänken", "i hallens halvskymning", "i sovrummets mörker"],
      minCount: 56
    });

    const L3 = makeLexicon({
      cores: [
        "hans hand längs hennes lår", "deras tungor möttes", "hon bet sig i läppen",
        "hans kyssar blev våtare", "hennes kropp svarade på beröringen",
        "rytmen byggdes upp", "stön mot hans mun", "hon rullade höfterna",
        "han följde huden med munnen", "hon slöt ögonen och gav efter",
        "hans grepp blev fastare", "hon famlade efter hans tröja"
      ],
      intensifiers: ["mjukare", "tydligare", "djupare", "heta", "ivrigare"],
      suffixes: ["på sängkanten", "mot lakanen", "bakom stängd dörr", "i soffans hörn", "på mattan"],
      minCount: 56
    });

    // L4 – uttryckligt men utan klitoris
    const L4 = makeLexicon({
      cores: [
        "hans lem mot hennes sköte", "hon var våt mellan låren",
        "slickade hennes bröstvårta", "han trängde in långsamt",
        "hon red honom", "stöt för stöt", "han kom", "hon kom",
        "pulserande njutning", "rytmen blev hårdare",
        "han höll om hennes höfter", "hon pressade honom djupare"
      ],
      // lägg inte in klitoris, det hamnar i L5
      intensifiers: ["långsammare", "djupare", "hårdare", "snabbare", "rytmisk", "bestämt"],
      suffixes: ["på rygg", "över armstödet", "i sängens kant", "med benen runt hans midja", "med ryggen mot honom"],
      minCount: 56
    });

    // L5 – maximalt hett, med klitoris-fraser
    const L5 = makeLexicon({
      cores: [
        "hans kuk gled in i hennes fitta", "hon var slickblöt mellan låren", "han knullade henne hårt",
        "hon red honom tills benen skakade", "hans tunga på hennes klitoris",
        "hon sprutade över hans haka", "han tog henne bakifrån", "hon sög hans kuk djupt",
        "han kom hårt i henne", "hennes fitta pulserade runt honom",
        "hon gned sig fortare", "han höll om hennes höfter och gav efter",
        "hon skrek till när han fyllde henne", "han cirklade runt hennes klitoris med tungan",
        "hon pressade klitoris mot hans mun"
      ],
      intensifiers: ["hårt", "fort", "djupt", "ivrigt", "hungrigt", "otåligt", "bestämt"],
      suffixes: ["med ett grep om hennes höfter", "över bordskanten", "framåtlutad mot väggen", "med benen över hans axlar", "i soffans hörn"],
      minCount: 60
    });

    // ————————————————————————————————————————————————————————————————
    // 2) Cliché-filter (tom som default, fyll på om vi vill slippa specifika uttryck)
    // ————————————————————————————————————————————————————————————————
    const CLICHES = []; // t.ex.: ["nyckelben", "fläder", "böcker i hyllan"]

    // ————————————————————————————————————————————————————————————————
    // 3) Anti-kärlek (tas bort på 4–5) + explicit detektion
    // ————————————————————————————————————————————————————————————————
    const BAN_LOVE = [
      "kärlek","älskade","själsfrände","för evigt","evig kärlek","romans",
      "livets stora kärlek","kärleksförklaring","evigt tillsammans"
    ];
    const STEMS_EXPL = [
      /kuk\w*/i, /fitt\w*/i, /slid\w*/i, /sköt\w*/i, /lem\w*/i,
      /slick\w*/i, /knull\w*/i, /penetr\w*/i, /träng\w*/i, /rid\w*/i,
      /stöt\w*/i, /ollon\w*/i, /sprut\w*/i, /orgasm\w*/i, /\bkom(\b|ma|mit)\b/i,
      /klitoris\w*/i // OBS: detta får endast användas i L5 via lexikonet ovan
    ];

    // Mildare nivåer: förbjud grovt
    const FORBID_RAW_12 = ["kuk","fitta","knulla","ollon","spruta","sprutade","trängde","slickade","klitoris"];
    const REPL_12 = { "kuk":"lem","fitta":"sköte","knulla":"älska","ollon":"spetsen","spruta":"komma","sprutade":"kom","trängde":"nuddade","slickade":"smekte","klitoris":"hennes känsligaste punkt" };
    const REPL_3  = { "kuk":"lem","fitta":"sköte","knulla":"tog henne","klitoris":"hennes mest känsliga punkt" };

    // Mängdmål (≈170 wpm)
    const targetWords = Math.max(180, Math.min(900, Math.round(mins * 170)));

    // System + user
    const system = buildSystem(lvl, targetWords);
    const user = [
      `Idé: ${idea.trim()}`,
      "Skriv i ett sammanhängande stycke, idiomatisk svenska för högläsning.",
      "Variera meningslängd; inkludera 1–3 repliker.",
      "Avsluta i andhämtning, inte i romantisk deklaration."
    ].join("\n");

    const signal = AbortSignal.timeout(60000);

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

    // ————————————————————————————————————————————————————————————————
    // 4) Efterbearbetning: anti-kärlek (4–5), nivåfilter, injektion, anti-kliché
    // ————————————————————————————————————————————————————————————————
    let debug = { level:lvl, stemHitsBefore:0, injected:0, loveRemoved:0, bansApplied:0, early:false, clichés:0 };

    // Kliché-filter (lättvikt): ta bort exemplar om de finns i listan
    if (CLICHES.length) {
      const resCli = hardBan(text, CLICHES, {});
      text = resCli.out; debug.clichés = resCli.count;
    }

    // 4–5: ta bort romantikord
    if (lvl >= 4) {
      const resLove = hardBan(text, BAN_LOVE, { "kärlek":"åtrå","älskade":"du","romans":"möte" });
      text = resLove.out; debug.loveRemoved = resLove.count;
    }

    if (lvl <= 2) {
      const res = hardBan(text, FORBID_RAW_12, REPL_12);
      text = res.out; debug.bansApplied = res.count;
      text = enrich(text, L1, L2, lvl); // injicera milda
    } else if (lvl === 3) {
      const res = hardBan(text, ["kuk","fitta","knulla","klitoris"], REPL_3);
      text = res.out; debug.bansApplied = res.count;
      text = enrich(text, L3, L3, lvl);
    } else {
      // 4–5: tidig handling + explicit stammar + injektion
      const first8 = getFirstNSentences(text, 8).join(" ");
      const earlyHits = countStemHits(first8, STEMS_EXPL);
      if (lvl === 5 && earlyHits < 1) {
        const opener = "Dörren slog igen. Hon drog ner mig i soffan, tryckte sig mot mig och lät handen glida beslutsamt över byxlinningen.";
        text = injectAtStart(text, ensurePeriod(opener));
        debug.early = true;
      }
      debug.stemHitsBefore = countStemHits(text, STEMS_EXPL);

      // Kravnivå
      const need = (lvl === 5) ? 10 : 5;
      if (debug.stemHitsBefore < need) {
        const pool = (lvl === 5 ? L5 : L4);
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

// ————————————————————————————————————————————————————————————————
// Helpers
// ————————————————————————————————————————————————————————————————
function J(obj, status=200){ return new Response(JSON.stringify(obj), { status, headers:{ "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" } }); }
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function tidy(s){ return String(s).replace(/\r/g,"").replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim(); }
function excerptOf(t,max){ return t.length<=max ? t : t.slice(0,max).replace(/\s+\S*$/,"")+"…"; }

function hardBan(text, terms, replMap={}) {
  let out = text, count = 0;
  for (const raw of terms) {
    const re = new RegExp(String(raw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, (m) => { count++; const key=m.toLowerCase(); return replMap[key] ?? ""; });
  }
  return { out, count };
}
function choose(arr, n){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a.slice(0, Math.max(0, Math.min(n, a.length))); }
function splitSentences(txt){
  const parts = txt.split(/([.!?…]+)\s+/);
  const out=[]; for(let i=0;i<parts.length;i+=2){ const s=(parts[i]||"").trim(); const p=(parts[i+1]||".").trim(); if(s) out.push(s+(p||".")); }
  return out;
}
function getFirstNSentences(txt,n){ return splitSentences(txt).slice(0, Math.max(0,n)); }
function ensurePeriod(s){ return /[.!?…]$/.test(s.trim()) ? s.trim() : s.trim()+"."; }
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

// ————————————————————————————————————————————————————————————————
// Lexikon-generator: skapar 50+ uttryck per nivå från rötter
// ————————————————————————————————————————————————————————————————
function makeLexicon({ cores, intensifiers=[], suffixes=[], minCount=56 }){
  const out = new Set();
  // rena rötter
  cores.forEach(c => out.add(c));
  // c + intensifier
  for (const c of cores) for (const i of intensifiers) out.add(`${c} ${i}`);
  // c + suffix
  for (const c of cores) for (const s of suffixes) out.add(`${c} ${s}`);
  // i + c + s
  for (const i of intensifiers) for (const c of cores) for (const s of suffixes) {
    if (out.size >= minCount) break;
    out.add(`${i} ${c} ${s}`);
  }
  // trim + returnera som array (begränsa till ~minCount*1.5)
  return Array.from(out).map(x => x.trim()).filter(Boolean).slice(0, Math.max(minCount, Math.min(out.size, minCount*2)));
}
function shuffle(a){ const arr=a.slice(); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }

// ————————————————————————————————————————————————————————————————
// Systemprompt per nivå (ingen klitoris i 4, fri på 5)
// ————————————————————————————————————————————————————————————————
function buildSystem(level, targetWords){
  const guard =
    "Allt är mellan vuxna (18+) och samtyckande. Inga minderåriga. Inget tvång eller våld. " +
    "Skriv idiomatisk svenska för högläsning, undvik klyschor/upprepningar. " +
    `Längd ≈ ${targetWords} ord (±15%).`;

  if (level <= 1) {
    return [
      "Du skriver oskyldigt romantiska, antydande noveller på svenska.",
      guard,
      "Ton: mjuk, blygt laddad, fokus på blickar/beröring över tyg. Ingen explicit anatomi."
    ].join("\n");
  }
  if (level === 2) {
    return [
      "Du skriver milda, varma noveller på svenska.",
      guard,
      "Ton: kyssar och händer över hud, sensuell närvaro, men undvik råa termer."
    ].join("\n");
  }
  if (level === 3) {
    return [
      "Du skriver tydligt sensuella noveller på svenska, utan råa ord.",
      guard,
      "Ton: kroppsligt och närvarande, en växande rytm, elegans före råhet."
    ].join("\n");
  }
  if (level === 4) {
    return [
      "Du skriver heta, explicita noveller på svenska (vuxet språk).",
      guard,
      "Ton: åtrå och kropp, konkret handling. Undvik ord om 'kärlek/romans'.",
      "Använd inte ordet 'klitoris' på denna nivå."
    ].join("\n");
  }
  // level 5
  return [
    "Du skriver mycket heta, explicita noveller på svenska.",
    guard,
    "Ton: rå lust och tempo, inga kärleksdeklarationer. Snabb start mot handling.",
    "Tillåt ord som 'klitoris' och andra explicita vuxna uttryck där det passar."
  ].join("\n");
}
