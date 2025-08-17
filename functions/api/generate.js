// /functions/api/generate.js
export const onRequestPost = async ({ request, env }) => {
  try {
    const { idea, level, minutes } = await request.json();

    const _idea = (typeof idea === "string" ? idea : "").trim();
    const _level = Number.isFinite(level) ? Math.max(1, Math.min(5, Number(level))) : 2;
    const _minutes = Number.isFinite(minutes) ? Math.max(1, Math.min(10, Number(minutes))) : 5;

    if (!_idea) return json({ ok:false, error:"empty_idea" }, 400);

    const targetWords = Math.max(120, Math.min(1200, Math.round(_minutes * 170)));

    // Styrord (exempel)
    const soft = ["värme mellan oss", "långsam kyss", "dov längtan", "hans händer mot min rygg", "hennes händer i mitt hår"];
    const sensual = ["läppar mot hud", "kroppar nära", "sval hals", "andning som hakar upp sig", "tyget som glider"];
    const hot = ["hans lem", "hennes sköte", "våt värme", "tungan som cirklar", "han tränger in", "hon rider honom", "höfter som svarar"];

    const levelSpecs = {
      1:{ tone:"romantisk, antydande, utan explicita ord", must:soft.slice(0,3), avoid:[...hot] },
      2:{ tone:"mild och sensuell, tydligt vuxen men varsam", must:[soft[3], sensual[0]], avoid:["lem","tränger in","fitta","kuk","klitoris"] },
      3:{ tone:"sensuell och tydligare, men med elegans", must:[sensual[1],sensual[4]], avoid:["fitta","kuk"] },
      4:{ tone:"het och direkt, konkreta handlingar, utan grova ord", must:["våt värme","tungan som cirklar"], avoid:["fitta","kuk"] },
      5:{ tone:"rakt, hett och explicit men respektfullt", must:["hans lem","hennes sköte","han tränger in","hon rider honom","tungan som cirklar","våt värme","höfter som svarar"], avoid:[] }
    };
    const spec = levelSpecs[_level];

    const system = [
      "Skriv på svenska en sammanhängande erotisk kortnovell avsedd för uppläsning.",
      "Alltid en röd tråd: 1) inledning, 2) stegring, 3) hetta, 4) avtoning.",
      "Jag-berättare. Partnern är 'hon' om inte idén anger annat.",
      "Endast vuxna och samtycke. Inget våld/tvång/minderåriga/blod/smärta/degradering.",
      "Undvik upprepningar. Variera tempo och ordval. Pauser får finnas naturligt.",
      `Ton: ${spec.tone}.`,
      `Sikta på cirka ${targetWords} ord.`,
      `MÅSTE-FRASER: ${spec.must.join(", ")}.`,
      spec.avoid.length ? `UNDVIK: ${spec.avoid.join(", ")}.` : "Inga extra förbud.",
      "Skriv utan rubriker/listor/markdown. Endast ren prosa."
    ].join(" ");

    const user = [
      `IDÉ: ${_idea}`,
      "Följ strukturen strikt (inledning → stegring → hetta → avtoning) och håll kön/perspektiv konsekvent.",
      "Använd MÅSTE-FRASER där de passar i handlingen. Inga lösa 'inkast'.",
      "Avsluta med lugn efterton – ingen moralkaka."
    ].join("\n");

    const mistralKey = env.MISTRAL_API_KEY || env.MISTRAL_KEY;
    const openaiKey  = env.OPENAI_API_KEY  || env.OPENAI_KEY;

    let text=null;

    if (mistralKey) {
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method:"POST",
        headers:{ "Authorization":`Bearer ${mistralKey}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"mistral-large-latest",
          temperature: _level>=4 ? 0.9 : 0.8,
          max_tokens: Math.min(1400, Math.round(targetWords*1.5)),
          messages:[{role:"system",content:system},{role:"user",content:user}]
        })
      });
      if (!r.ok){ const err = await safeJson(r); return json({ok:false,error:"mistral_error",detail:err},502); }
      const data = await r.json();
      text = data?.choices?.[0]?.message?.content?.trim() || null;
    } else if (openaiKey) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method:"POST",
        headers:{ "Authorization":`Bearer ${openaiKey}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"gpt-4o-mini",
          temperature: _level>=4 ? 0.9 : 0.8,
          max_tokens: Math.min(1400, Math.round(targetWords*1.5)),
          messages:[{role:"system",content:system},{role:"user",content:user}]
        })
      });
      if (!r.ok){ const err = await safeJson(r); return json({ok:false,error:"openai_error",detail:err},502); }
      const data = await r.json();
      text = data?.choices?.[0]?.message?.content?.trim() || null;
    } else {
      return json({ ok:false, error:"missing_api_key", detail:"Lägg in MISTRAL_API_KEY eller OPENAI_API_KEY i Pages → Settings → Env vars."}, 500);
    }

    if (!text) return json({ ok:false, error:"empty_story" }, 502);

    text = text.replace(/^---\s*$/gm,"").trim();
    return json({ ok:true, text }, 200);
  } catch(err){
    return json({ ok:false, error:"server_error", detail:String(err?.message||err) }, 500);
  }
};

const json = (obj, status=200) =>
  new Response(JSON.stringify(obj), { status, headers:{ "content-type":"application/json; charset=utf-8", "cache-control":"no-store" }});

const safeJson = async (r)=>{ try{return await r.json();}catch{return {status:r.status,statusText:r.statusText}} };
