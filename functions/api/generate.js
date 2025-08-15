// Skapar berättelsetext (PG-13 – ej grafiskt) via OpenAI
const SYS = `Du skriver romantiska, sensuella men icke-grafiska berättelser på svenska (PG-13).
Undvik detaljerad explicit sexualitet. Ton: varm, respektfull, samtycke, vuxna.
Maximera flyt och bildspråk utan att bli pornografisk.`;

function buildUserPrompt(idea, words, spice){
  // "spice" påverkar ton, inte grafisk detaljnivå
  const heat = ['mycket mild', 'mild', 'lagom', 'het men elegant', 'passionerat men icke-grafiskt'][Math.min(4, Math.max(0, spice-1))];
  return `Idé: ${idea}
Önskad längd: ca ${words} ord.
Ton: ${heat}.
Skriv i nutid, 1:a eller 3:e person, med tydligt samtycke och dialog. Avsluta med mjuk avrundning.`;
}

async function callOpenAI(env, prompt){
  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYS },
      { role: "user", content: prompt }
    ],
    temperature: 0.9,
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok){
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  return text;
}

function cors(h = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...h,
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}

export async function onRequestPost(ctx) {
  try{
    const { minutes = 5, spice = 2, idea = "" } = await ctx.request.json();
    if (!idea) return new Response(JSON.stringify({ error: "Missing idea" }), { status: 400, headers: cors({ "Content-Type":"application/json" }) });

    const words = Math.max(200, Math.round((+minutes || 5) * 170));
    const userPrompt = buildUserPrompt(String(idea), words, +spice || 2);
    const text = await callOpenAI(ctx.env, userPrompt);

    const excerpt = text.slice(0, 400) + (text.length > 400 ? "…" : "");
    return new Response(JSON.stringify({ text, excerpt }), {
      headers: cors({ "Content-Type": "application/json; charset=utf-8" })
    });
  }catch(err){
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: cors({ "Content-Type":"application/json" })
    });
  }
}
