// functions/api/generate.js
// Genererar svensk text för BN. 1–3 via OpenAI, 4–5 via Mistral.
// Skalar längd med minutes och använder nivå-specifika ordlistor (50/ nivå).
// Tar även emot banPhrases från klient (anti-klyscha).

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  try {
    const body = await request.json().catch(() => ({}));
    const idea = String(body?.idea || "").trim();
    const spice = clamp(Number(body?.spice || 2), 1, 5);
    const minutes = clamp(Number(body?.minutes || 5), 1, 15);
    const banPhrases = Array.isArray(body?.banPhrases) ? body.banPhrases.slice(0, 80) : [];

    if (!idea) return j({ error: "empty_idea" }, 400);

    // ===== Lexikon per nivå =====
    const L1 = [
      "kramade om","höll handen","såg djupt i ögonen","värme spreds i kroppen","log blygt","en mjuk kyss på kinden",
      "deras fingrar nuddades","smekte hans hår","hjärtat bultade","ett leende växte fram","deras läppar möttes försiktigt",
      "höll om varandra länge","rösten darrade","fjärilar i magen","hennes doft gjorde honom yr","en oskyldig beröring",
      "hans hand vilade på hennes arm","det pirrade i kroppen","de skrattade tillsammans","deras pannor möttes",
      "mjukt andetag mot halsen","en längtan i blicken","hans kind mot hennes","deras händer sammanflätade","ett värmande skratt",
      "han strök bort en hårslinga","hon kände sig trygg i hans famn","en oskyldig kyss på pannan","deras steg i takt",
      "hjärtat slog snabbare","rodnaden spred sig","hans röst viskade mjukt","doften av parfym","deras händer möttes i mörkret",
      "deras skratt fyllde rummet","en varm kram","hans fingertoppar nuddade hennes","deras läppar fann varandra","en kyss i regnet",
      "hans andetag värmde hennes nacke","deras blickar fastnade i varandra","hon rodnade av hans komplimang","hans hand på hennes rygg",
      "deras skratt blandades","en pirrande känsla","hon lutade huvudet mot hans axel","hans röst fick henne att le",
      "deras händer höll hårt","en stilla kyss","tryggheten i hans närhet"
    ];

    const L2 = [
      "hans läppar mötte hennes med värme","deras kyssar blev djupare","hon smekte hans kind mjukt","hans fingrar lekte med hennes hår",
      "deras andetag blev tyngre","hon vilade handen mot hans bröst","hans händer höll om hennes midja","deras kroppar drogs närmare",
      "hans röst fylld av längtan","deras läppar utforskade varandra","han kysste hennes hals långsamt","hennes kropp darrade till",
      "hans hand följde hennes kurvor","hon drog honom närmare","deras kyssar blev ivrigare","han viskade hennes namn",
      "hennes fingrar smekte hans nacke","hans kropp värmde hennes","deras kyssar smakade passion","hon kände hans hjärtslag",// functions/api/generate.js
// Genererar svensk text. 1–3 OpenAI (snällare), 4–5 Mistral (friare).
// Skalar längd på minuter och förstärker skillnaden mellan nivåerna.

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  try {
    const body = await request.json().catch(() => ({}));
    const idea = String(body?.idea || "").trim();
    const spice = clamp(Number(body?.spice || 2), 1, 5);
    const minutes = clamp(Number(body?.minutes || 5), 1, 15);

    if (!idea) return j({ error: "empty_idea" }, 400);

    // Ca 170 ord/min
    const targetWords = Math.round(minutes * 170);

    // ——— Gemensam säkerhet/ram ———
    const guard = `
Alla deltagare är vuxna (18+) och samtyckande.
Inga minderåriga, tvång, droger, övergrepp, hat eller diskriminering.
Undvik verkliga identiteter och privat information.
Skriv på idiomatisk svenska, uppläsningsvänligt, variera rytm och undvik upprepningar.
Mål: ca ${targetWords} ord (±15%).
`;

    // ——— Lexikon ———
    const explicitLex = [
      "lem","kuk","slida","sköte","våt","slicka","tunga",
      "trängde","penetrerade","rida","stötar","pulserande","glidande",
      "samlag","orgasm","kom"
    ];
    const explicitList = explicitLex.join(", ");

    // ——— Ton per nivå ———
    const lvl1 = `
TON: romantisk, antydande. Fokus på blickar, dofter, fjärilar i magen, värme.
FÖRBJUDET språk: ${explicitList}.
Tillåt kyssar och subtil beröring över kläder – inga tekniska detaljer.
Avsluta diskret utan klyschor.
`;

    const lvl3 = `
TON: sensuell och tydlig kroppslighet men utan explicit vokabulär.
FÖRBJUDET språk: ${explicitList}.
Tillåt händer under kläder, läppar mot hud, andning, stön; håll det elegant.
Ingen mekanik (inga "trängde/penetrerade/rida" etc.).
`;

    const lvl5 = `
TON: het och direkt men respektfull. Vuxet språk tillåtet.
KRAV: Väva in flera ord ur listan där det passar naturligt: ${explicitList}.
Beskriv rörelser, rytm och stegring i vågor (tempo, tryck, djup).
Undvik klichéer och omskrivningar i payoffen. Ingen "kyss och fade" på slutet.
`;

    const system = `
Du är en svensk författare av sensuella ljudnoveller.
Skriv i presens eller preteritum konsekvent, korta meningar med varierad längd.
Ingen uppräkning i listform, inga cookie-cutter fraser.
${guard}
${spice <= 1 ? lvl1 : spice <= 3 ? lvl3 : lvl5}
`;

    const user = `
Idé från användare: "${idea}"
Sätt scenen snabbt (1–2 meningar), bygg stegring, leverera payoff, och runda av utan moralkakor.
`;

    const useMistral = spice >= 4 && !!env.MISTRAL_API_KEY;

    let story = "";
    if (useMistral) {
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "mistral-large-latest",
          temperature: 0.95,
          max_tokens: 1500,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });
      if (!r.ok) return j({ error: "mistral_failed", status: r.status, details: await safe(r) }, 502);
      const data = await r.json();
      story = (data?.choices?.[0]?.message?.content || "").trim();
    } else {
      if (!env.OPENAI_API_KEY) return j({ error: "missing_openai_key" }, 500);
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: spice <= 1 ? 0.55 : 0.7,
          max_tokens: 1200,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });
      if (!r.ok) return j({ error: "openai_failed", status: r.status, details: await safe(r) }, 502);
      const data = await r.json();
      story = (data?.choices?.[0]?.message?.content || "").trim();
    }

    if (!story) return j({ error: "empty_story" }, 502);

    // Städning + små förstärkningar
    story = tidy(story);
    if (spice >= 4) {
      // säkerställ att minst några explicit-ord finns
      const lc = story.toLowerCase();
      const hits = explicitLex.filter(w => lc.includes(w));
      if (hits.length < 3) {
        story += `\n\nHettan steg; ${explicitLex.slice(0,5).join(", ")} vävdes in i rytmen deras kroppar delade.`;
      }
    }
    const excerpt = excerptOf(story, 280);
    return j({ story, excerpt });
  } catch (e) {
    return j({ error: "generate_crash", message: String(e) }, 500);
  }
}

function j(o, s=200){return new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json; charset=utf-8'}});}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function tidy(t){return String(t).replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').replace(/[ \t]{2,}/g,' ').trim();}
function excerptOf(t,max){return t.length<=max?t:t.slice(0,max).replace(/\s+\S*$/,'')+'…';}
async function safe(r){try{return await r.json();}catch{try{return await r.text();}catch{return'';}}}
      "hans hand vilade på hennes lår","hon drog in doften av honom","deras kroppar smälte samman","hon kysste honom tillbaka",
      "hans fingrar följde hennes rygg","deras munnar fann varandra igen","hennes andetag blev korta","hans kyssar flyttade sig neråt",
      "hennes kropp svarade på hans beröring","deras läppar möttes hungrigt","han kysste hennes skuldror","hennes händer drogs över hans bröstkorg",
      "deras kyssar fyllde tystnaden","han smekte hennes lår varsamt","hennes läppar fann hans hals","deras kroppar pressades närmare",
      "hon viskade längtande ord","hans hand gled över hennes höft","deras kyssar varade länge","hennes fingrar följde hans armar",
      "hans kyssar fick henne att darra","hennes läppar fann hans örsnibb","deras kroppar rörde sig i takt","hon kände värmen sprida sig",
      "han tryckte henne närmare sig","deras kyssar blev allt mer intensiva","hennes händer vilade på hans axlar","hans kyssar var som eld",
      "deras kroppar fann varandra i mörkret","hon smälte i hans famn"
    ];

    const L3 = [
      "hans händer följde hennes midja","hennes läppar fann hans bröst","deras kroppar pressades tätt","hennes fingrar följde hans mage",
      "han kysste hennes hals vått","hon bet sig i läppen av lust","hans hand gled upp längs hennes lår","deras tungor möttes",
      "hennes kropp välvde sig under hans beröring","han smekte hennes rygg långsamt","deras kyssar blev vilda","hennes händer följde hans höfter",
      "han drog upp hennes tröja långsamt","hennes kropp skakade av lust","han kysste henne mellan skuldrorna","hennes fingrar smekte hans nacke",
      "hans läppar följde hennes bröstkorg","hon kände hans värme mot sig","deras kroppar rörde sig i rytm","hon stönade lågt mot hans mun",
      "hans hand smekte hennes mage","hennes fingrar letade sig neråt","hans kyssar följde hennes lår","hon drog naglarna över hans hud",
      "han kysste hennes bröst över tyget","hennes kropp pressade sig mot honom","hans hand fann vägen under hennes blus",
      "hon lutade sig bakåt i hans famn","deras andetag blandades häftigt","hans kyssar var våta och ivriga","hennes kropp brann av begär",
      "han smekte henne genom tyget","hennes fingrar följde hans käke","hans hand vilade mellan hennes lår","hon kände hans lust mot sitt lår",
      "deras kyssar smakade hetta","hans tungspets fann hennes hud","hon böjde nacken bakåt i njutning","hans hand följde hennes kurvor girigt",
      "hennes kropp svarade med darrningar","han kysste henne över nyckelbenen","hennes läppar sökte hans bröstvårtor",
      "deras kroppar rörde sig otåligt","hans händer drog upp hennes kjol","hennes fingrar smekte honom genom tyget",
      "hans kyssar fick henne att stöna","hennes kropp var spänd av lust","han tryckte henne mot väggen","hennes händer slet i hans skjorta",
      "deras kroppar flöt samman i åtrå"
    ];

    const L4 = [
      "hans lem tryckte mot hennes sköte","hennes slida var varm och inbjudande","han kysste hennes bröstvårtor ivrigt",
      "hennes hand fann hans lem genom tyget","hans fingrar gled längs hennes fuktiga sköte","hon stönade när han trängde in med fingrarna",
      "hans tunga cirklade över hennes bröstvårta","hennes kropp spändes under hans smekningar","hans lem hårdnade i hennes hand",
      "hennes slida pulserade av åtrå","han kysste henne mellan låren","hennes våthet rann nerför insidan av låren",
      "hans fingrar smekte hennes sköte långsamt","hon pressade sig mot hans mun","hans lem pulserade av begär",
      "hennes läppar omslöt hans bröstvårta","han slickade henne mjukt men envist","hennes kropp välvde sig i njutning",
      "hans händer spred hennes lår isär","hennes stön fyllde rummet","han tryckte sin lem mot hennes sköte",
      "hennes fingrar drog över hans heta hud","hans tunga fann hennes klitoris","hennes kropp skakade när han slickade henne",
      "hans lem gled längs hennes våthet","hennes hand pumpade honom långsamt","hans läppar sög fast kring hennes bröstvårta",
      "hennes sköte brann av begär","han trängde in med två fingrar","hennes stön blev allt högre",
      "hans tunga lekte med hennes känsliga punkter","hennes läppar fann hans lem","han kände smaken av hennes safter",
      "hennes kropp pressade sig girigt mot honom","hans fingrar cirklade över hennes klitoris","hennes hand rörde hans lem i takt",
      "hans kyssar följde hennes inre lår","hennes våthet dränkte hans fingrar","hans tunga dansade mellan hennes läppar där nere",
      "hennes sköte bultade av lust","han tryckte in hela sin hand i hennes hår","hennes stön blev till rop",
      "hans lem låg tung i hennes handflata","hennes mun omslöt honom","han kände hur hon pulserade runt hans fingrar",
      "hennes kropp skakade i orgasm","hans stön mötte hennes","hennes sköte öppnade sig för honom",
      "han slickade henne tills hon sprutade","hennes hand höll hårt om hans lem"
    ];

    const L5 = [
      "hans kuk gled långsamt in i hennes fitta","hennes fitta var slickblöt och väntande","han tryckte henne mot väggen och knullade hårt",
      "hennes hand runkade hans kuk i fasta tag","hans tunga slickade hennes klitoris våldsamt","hennes safter rann nerför hans haka",
      "han körde kuken djupt i hennes fitta","hennes stön ekade när han knullade henne","han tog henne bakifrån och höll hårt i höfterna",
      "hennes fitta pulserade kring hans kuk","han smiskade henne och trängde in igen","hennes mun sög tag om hans kuk",
      "han tryckte ner henne och slickade tills hon skrek","hennes naglar rispade hans rygg av extas","han knullade henne allt hårdare",
      "hennes kropp skakade i orgasm under honom","han sprutade ner hennes mage","hennes tunga lekte med ollonet",
      "han höll henne i håret och knullade munnen","hennes fitta var så blöt att det skvätte","han pressade henne mot sängen med sin kuk",
      "hennes sköte sög girigt åt sig varje stöt","han knäppte upp hennes kläder och slet av dem","hennes kropp skrek efter mer kuk",
      "han körde två fingrar i hennes fitta och en i röven","hennes bröst studsade i takt med hans stötar","han kom hårt över hennes bröst",
      "hennes hand pumpade honom tills han sprutade","han slickade henne tills hon sprutade över hans ansikte","hennes kuksugande fick honom att stöna högt",
      "han satte sig på kanten av sängen och lät henne rida","hennes fitta slukade hans kuk helt","han tryckte in sig djupt tills hon skrek hans namn",
      "hennes safter rann ner längs hans kuk","han knullade henne på bordet så glasen föll","hennes mun fylldes av hans sats",
      "han vände henne och tog henne bakifrån","hennes fitta var så trång att han nästan sprack","han kände henne rida honom tills han kom",
      "hennes fingrar slickades rena av hennes egna safter","han knullade henne mot väggen med kraft","hennes skrik fyllde hela rummet",
      "han sprutade inuti henne tills hon kände värmen","hennes tunga slickade hans kuk ren","han slet av trosorna och körde in på en gång",
      "hennes kropp darrade av orgasm på orgasm","han höll henne fast och körde djupt","hennes hand styrde kuken in i hennes fitta",
      "han knullade henne tills benen gav vika","hennes kropp skakade av njutning när han fyllde henne"
    ];

    // förbjudna i 1–3 = alla uttryck i 4–5
    const EXPLICIT_FORBIDDEN = [...L4, ...L5];

    // ca 170 ord/min
    const targetWords = Math.round(minutes * 170);

    // ===== Ramverk och nivå-styrning =====
    const guard = `
Alla personer är vuxna (18+) och samtyckande. Inga minderåriga, tvång, droger, övergrepp, hat eller diskriminering.
Skriv idiomatisk svenska, uppläsningsvänligt, varierad rytm och undvik upprepningar.
Målslängd ≈ ${targetWords} ord (±15%).
`;

    const lvl1 = `
TON: romantisk & antydande. Fokus på blickar, doft, värme, beröring över tyg, förväntan.
ANVÄND gärna ord/fraser ur denna lista: ${L1.join("; ")}.
FÖRBJUDET: alla explicitare uttryck, samt: ${EXPLICIT_FORBIDDEN.join("; ")}, ${banPhrases.join("; ")}.
Inga penetrations- eller sexhandlingar.
`;

    const lvl2 = `
TON: varmt & romantiskt men laddat. Kyssar och tydlig åtrå, fortfarande utan explicit mekanik.
ANVÄND gärna ord/fraser ur denna lista: ${L2.join("; ")}.
FÖRBJUDET: ${EXPLICIT_FORBIDDEN.join("; ")}, ${banPhrases.join("; ")}.
`;

    const lvl3 = `
TON: sensuellt & åtråfyllt, mer kropp – men undvik råa termer.
ANVÄND gärna ord/fraser ur denna lista: ${L3.join("; ")}.
FÖRBJUDET: ${EXPLICIT_FORBIDDEN.join("; ")}, ${banPhrases.join("; ")}.
Ingen rå explicit mekanik/ordval.
`;

    const lvl4 = `
TON: tydligt erotiskt, vuxet och kroppsligt – men stilfullt.
ANVÄND ord/fraser ur denna lista där det passar naturligt: ${L4.join("; ")}.
UNDVIK klyschor & upprepningar. Inga minderåriga. Samtycke tydligt.
`;

    const lvl5 = `
TON: het, explicit och vuxen men respektfull. Variera ordval.
MÅSTE väva in flera uttryck naturligt ur denna lista: ${L5.join("; ")}.
UNDVIK klyschor & upprepningar. Ingen moraliserande "fade-out". Samtycke tydligt.
`;

    const system = `
Du är en svensk författare av sensuella ljudnoveller för högläsning.
Skriv konsekvent tempus (presens eller preteritum), korta/medellånga meningar, ingen punktlista.
${guard}
${spice<=1 ? lvl1 : spice<=2 ? lvl2 : spice<=3 ? lvl3 : spice<=4 ? lvl4 : lvl5}
`;

    const user = `
Idé från användare: "${idea}"
Sätt scenen snabbt (1–2 meningar), bygg stegring i vågor, leverera payoff och runda av utan klichéer.
`;

    const useMistral = spice >= 4 && !!env.MISTRAL_API_KEY;
    let story = "";

    if (useMistral) {
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "mistral-large-latest",
          temperature: 0.95,
          top_p: 0.9,
          max_tokens: 1600,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });
      if (!r.ok) return j({ error: "mistral_failed", status: r.status, details: await safe(r) }, 502);
      const data = await r.json();
      story = (data?.choices?.[0]?.message?.content || "").trim();
    } else {
      if (!env.OPENAI_API_KEY) return j({ error: "missing_openai_key" }, 500);
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: spice <= 1 ? 0.55 : spice <= 2 ? 0.65 : 0.75,
          top_p: 0.9,
          max_tokens: 1300,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });
      if (!r.ok) return j({ error: "openai_failed", status: r.status, details: await safe(r) }, 502);
      const data = await r.json();
      story = (data?.choices?.[0]?.message?.content || "").trim();
    }

    if (!story) return j({ error: "empty_story" }, 502);

    // ===== Efterbearbetning =====
    story = tidy(story);

    // Hårdbanna klyschor från klient (och trimma om det skapades ändå)
    if (banPhrases.length) story = hardBan(story, banPhrases, spice);

    // Säkerställ att nivå 5 faktiskt använder flera hårda uttryck
    if (spice === 5) {
      const hits = countHits(story.toLowerCase(), L5);
      if (hits < 5) {
        // mild "injicerad" förstärkning (naturlig fras, ej onaturlig spam)
        story += `\n\nDe tappade all kontroll; ${pick(L5)}, ${pick(L5)}, och ${pick(L5)} – tills allt brast i ett hett crescendo.`;
      }
    }

    // Tunna ut upprepningar av 4-grams över 3 gånger
    story = limitRepeats(story, 4, 3);

    const excerpt = excerptOf(story, 420);
    return j({ story, excerpt });

  } catch (e) {
    return j({ error: "generate_crash", message: String(e) }, 500);
  }
}

/* ===== helpers ===== */
function j(o, s=200){ return new Response(JSON.stringify(o), { status:s, headers:{'content-type':'application/json; charset=utf-8'} }); }
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function tidy(t){ return String(t).replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').replace(/[ \t]{2,}/g,' ').trim(); }
function excerptOf(t,max){ return t.length<=max ? t : t.slice(0,max).replace(/\s+\S*$/,'')+'…'; }
async function safe(r){ try{return await r.json();}catch{ try{return await r.text();}catch{return'';} } }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function hardBan(text, bans=[], spice){
  if (!bans?.length) return text;
  let out = text;
  const repl = {
    "nyckelben":"hals","värme spred sig":"det blev varmare","fjärilar i magen":"pirrade",
    "kunde inte låta bli":"jag gav efter","blick möttes":"vi såg på varandra"
  };
  for (const b of bans){
    const re = new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"), 'gi');
    if (spice<=3) out = out.replace(re, ''); // ta bort helt i mildare nivåer
    else out = out.replace(re, (m)=> (repl[b.toLowerCase()] || '')); // ersätt i hetare nivåer
  }
  return out;
}

function limitRepeats(text, n=4, max=3){
  const words = text.split(/\s+/);
  const seen = new Map();
  const keep = new Array(words.length).fill(true);
  for (let i=0;i<=words.length-n;i++){
    const gram = words.slice(i,i+n).join(' ').toLowerCase();
    const c=(seen.get(gram)||0)+1; seen.set(gram,c);
    if (c>max) keep[i]=false;
  }
  return words.filter((_,i)=>keep[i]).join(' ');
}

function countHits(txt, phrases){
  let c=0; for (const p of phrases){ if (txt.includes(p.toLowerCase())) c++; }
  return c;
}
