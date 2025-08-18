// /functions/api/generate.js
// Sammanhängande novell med tydlig röd tråd. Nivå 1–5 styrs via extern lexicon.json.
export default {
  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return j({ ok:false, error:"method_not_allowed" }, 405);
      }
      const { idea = "", level = 2, minutes = 5 } = await request.json();

      const min = Math.max(1, Math.min(15, Number(minutes) || 5));
      const lvl = Math.max(1, Math.min(5, Number(level) || 2));
      const concept = String(idea||"").trim();
      if (!concept) return j({ ok:false, error:"empty_idea" }, 400);

      const targetWords = Math.round(min * 170);
      const minWords = Math.max(220, Math.round(targetWords * 0.9));
      const maxWords = Math.round(targetWords * 1.15);

      // Hämta lexikon externt så du kan uppdatera det utan att röra koden
      const origin = new URL(request.url).origin;
      let lex = null;
      try {
        const lr = await fetch(`${origin}/lexicon.json?v=${Date.now()}`, { cf:{ cacheTtl:0 } });
        if (lr.ok) lex = await lr.json();
      } catch {}
      // Fallback om filen saknas
      const fallback = {
        level1: ["varsamma händer","lätta beröringar","blickar som dröjer sig kvar","hjärtat slog snabbare","mjuk viskning"],
        level2: ["hetare kyssar","händer som utforskar","läppar mot halsen","fingrar under tyget","ryggradens båge","värme mellan låren"],
        level3: ["kroppar som söker rytm","andning som hakar upp sig","närhet som drar oss djupare","värmen tilltar","hon drar honom närmare"],
        // Fyll på i lexicon.json för 4 & 5 — här bara neutrala platshållare:
        level4: ["intim närhet","djärvare beröring","tydlig lust","hans grepp om höften","hon tar emot honom nära"],
        level5: ["mest intensiva nivån","raka ord om handling","tydligt vuxet språk","hett crescendo","lång, laddad klimax"]
      };
      const L = {
        1: lex?.level1?.length ? lex.level1 : fallback.level1,
        2: lex?.level2?.length ? lex.level2 : fallback.level2,
        3: lex?.level3?.length ? lex.level3 : fallback.level3,
        4: lex?.level4?.length ? lex.level4 : fallback.level4,
        5: lex?.level5?.length ? lex.level5 : fallback.level5
      };
      const mustCount = (lvl===5?6:(lvl===4?4:2));

      const system = [
        "Skriv på SVENSKA en sammanhängande erotisk kortnovell ämnad för UPPLÄSNING.",
        "Följ strikt: (1) inledning, (2) stegring, (3) hetta, (4) avtoning.",
        "Jag-berättare eller tredje person – håll perspektivet konsekvent och tydligt.",
        "Alltid vuxna och samtycke. Ingen skada, inget tvång, inga minderåriga.",
        "Undvik klyschor/upprepning. Variera ordval och tempo. Naturliga pauser är ok.",
        `NIVÅ ${lvl}: anpassa ton och tydlighet efter nivå.`,
        `Sikta på ${minWords}-${maxWords} ord.`,
        `Väv in minst ${mustCount} begrepp från nivålistan, naturligt i handlingen (inte som lista).`,
        "Avsluta alltid med en kort, lugn efterton som markerar att scenen är klar.",
        "Ingen rubrik eller lista – endast ren prosa."
      ].join(" ");

      const user = [
        `IDÉ: ${concept}`,
        "Skriv berättelsen nu. Följ strukturen och hålla tempus/person konsekvent.",
        `NIVÅLISTA (externt lexikon): ${L[lvl].join(", ")}`
      ].join("\n");

      // Anropa modell: Mistral om finns, annars OpenAI
      const timeoutMs = 65000;
      const ctrl = new AbortController();
      const timer = setTimeout(()=>ctrl.abort("timeout"), timeoutMs);

      let text = "", used = "";
      if (env.MISTRAL_API_KEY) {
        const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method:"POST",
          headers:{ "Authorization":`Bearer ${env.MISTRAL_API_KEY}`, "Content-Type":"application/json" },
          body: JSON.stringify({
            model:"mistral-large-latest",
            temperature:(lvl>=4?0.95:0.8),
            max_tokens: 2048,
            messages:[{role:"system",content:system},{role:"user",content:user}]
          }),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (!r.ok){ const e = await r.text().catch(()=> ""); return j({ ok:false, error:"mistral_error", detail:e }, 500); }
        const data = await r.json();
        text = (data.choices?.[0]?.message?.content || "").trim(); used = "mistral";
      } else if (env.OPENAI_API_KEY) {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method:"POST",
          headers:{ "Authorization":`Bearer ${env.OPENAI_API_KEY}`, "Content-Type":"application/json" },
          body: JSON.stringify({
            model:"gpt-4o-mini",
            temperature:(lvl>=4?0.95:0.8),
            max_tokens: 2048,
            messages:[{role:"system",content:system},{role:"user",content:user}]
          }),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (!r.ok){ const e = await r.text().catch(()=> ""); return j({ ok:false, error:"openai_error", detail:e }, 500); }
        const data = await r.json();
        text = (data.choices?.[0]?.message?.content || "").trim(); used = "openai";
      } else {
        clearTimeout(timer);
        return j({ ok:false, error:"no_model_key" }, 500);
      }

      if (!text) return j({ ok:false, error:"empty_text" }, 502);

      // Kontroll: kräva att minst mustCount uttryck från nivån faktiskt förekommer (generiskt, icke-listform)
      const must = L[lvl];
      const present = must.filter(m => text.toLowerCase().includes(String(m).toLowerCase()));
      if (present.length < mustCount) {
        // injicera en kort naturlig mening som binder in saknade begrepp
        const missing = must.filter(m => !present.includes(m)).slice(0, mustCount - present.length);
        if (missing.length){
          text += (text.endsWith(".")?"":"." ) + " " +
            `I rytmen och närheten kom även nyanser av ${missing.join(", ")} fram.`;
        }
      }

      // Trimma längd + säkerställ punkt och efterton
      const words = text.split(/\s+/);
      if (words.length > (maxWords + 40)) text = words.slice(0, maxWords).join(" ");
      if (!/[.!?…]$/.test(text)) text += ".";
      text += " När andetagen stillnat låg de kvar, delade ett leende och lät värmen klinga ut.";

      return j({ ok:true, text, model: used }, 200);
    } catch (err) {
      const msg = (err?.message||"").includes("timeout") ? "timeout" : (err?.message||"server_error");
      return j({ ok:false, error:"server_error", detail: msg }, 500);
    }
  }
};

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
