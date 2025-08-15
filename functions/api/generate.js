// Nivå 1–5 med tydliga stilregler + “spice rewrite” när bara nivån ändras
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();

    const idea      = (body.idea || "").trim();
    const mins      = Number(body.mins || 5);
    const spice     = Math.max(1, Math.min(5, Number(body.spice || 2)));
    const reuseText = Boolean(body.reuseText);
    const baseText  = (body.baseText || "").trim();

    if (!env.OPENAI_API_KEY) return err(500, "Saknar OPENAI_API_KEY i Cloudflare.");
    if (!reuseText && !idea)  return err(400, "Ingen idé angiven.");
    if (reuseText && !baseText) return err(400, "reuseText=true men baseText saknas.");

    const model = "gpt-5-mini";
    const maxTokens = Math.min(4096, Math.round(mins * 260 * 1.2)); // ≈170 ord/min

    const safety =
      "Allt innehåll är mellan vuxna med ömsesidigt samtycke. Inga minderåriga, inget tvång, inget våld, bestialitet eller incest.";
    const pacing = [
      "Pacing: öka intensiteten stegvis. Vid ~30% första tydliga beröringen.",
      "Vid ~60–70% kulmen. Avsluta med efterspel (inte ny scen)."
    ].join(" ");

    const rules = {
      1: "Nivå 1: romantisk och antydande; inga könsord; fokus på stämning, blickar, hud, andning.",
      2: "Nivå 2: sensuellt och kroppsligt; antydda beröringar och kyssar; fortfarande icke-grafiskt.",
      3: "Nivå 3: tydligt laddat; beskriv rörelse och värme; undvik råa könsord men var konkret.",
      4: "Nivå 4: explicit vuxet språk; tillåt ord som ‘lem’, ‘slida’, ‘våt’, ‘ta emot honom’; konkret om rytm och beröring.",
      5: "Nivå 5: fullt explicit vuxet språk; tillåt ‘tränga in’, ‘slicka’, ‘känna hur vått det är’; inga förnedrande uttryck; allt frivilligt."
    };

    const system = [
      "Skriv på naturlig, modern svenska med bra flyt och varierade meningar.",
      "Använd dialog där det passar, sensoriska detaljer (lukt/ljud/känsla).",
      safety, pacing, rules[spice]
    ].join(" ");

    const wordsTarget = Math.round(mins * 170);
    const framing = `Sikta på ~${wordsTarget} ord (±20%).`;

    const userNew = [
      `Idé: "${idea}"`,
      framing,
      "Struktur: början → upptrappning → kulmen → efterspel."
    ].join("\n");

    const userRewrite = [
      "Krydda om texten till vald nivå utan att ändra händelseförlopp i onödan.",
      framing,
      "Behåll ton och stil men höj explicit-nivån enligt reglerna.",
      "Text att krydda:", baseText
    ].join("\n");

    const payload = {
      model,
      input: [
        { role: "system", content: system },
        { role: "user",   content: reuseText ? userRewrite : userNew }
      ],
      max_output_tokens: maxTokens,
      temperature: spice >= 4 ? 1.0 : 0.9,
      top_p: 0.9
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const t = await r.text().catch(()=>r.statusText);
      return err(r.status, `OpenAI error: ${t}`);
    }

    const data = await r.json();
    const text =
      data?.output_text ||
      data?.choices?.[0]?.message?.content ||
      data?.data?.[0]?.content || "";

    if (!text) return err(502, "Tomt svar från modellen.");

    const excerpt = text.slice(0, 500) + (text.length > 500 ? " …" : "");
    return new Response(JSON.stringify({ text, excerpt }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });

  } catch (e) {
    return err(500, e.message || "Okänt fel.");
  }
}

function err(status, message){
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
