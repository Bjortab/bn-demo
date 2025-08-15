// Putsar texten för bättre prosodi och använder en uttrycksfull standardröst
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { text, voice, rate } = await request.json();

    if (!env.OPENAI_API_KEY) return err(500, "Saknar OPENAI_API_KEY i Cloudflare.");
    if (!text || !text.trim()) return err(400, "Ingen text att läsa upp.");

    const cleaned = tidy(text);
    const payload = {
      model: "gpt-4o-mini-tts",
      voice: voice || "verse",
      input: cleaned,
      format: "mp3",
      speed: Number(rate || 1.0)
    };

    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const t = await r.text().catch(()=>r.statusText);
      return err(r.status, `TTS error: ${t}`);
    }

    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: { "Content-Type": "audio/mpeg" },
      status: 200
    });

  } catch (e) {
    return err(500, e.message || "Okänt fel.");
  }
}

function tidy(s){
  let out = s.replace(/—/g, ", ").replace(/([^\.\!\?])\n/g,"$1.\n");
  out = out.split(/\n+/).map(line => {
    const parts = line.split(/(?<=[\.\!\?])\s+/);
    return parts.map(p => p.trim()).filter(Boolean).map(p => {
      if(p.length>220){ return p.replace(/, /g,". ").replace(/\s{2,}/g," "); }
      return p;
    }).join(" ");
  }).join("\n");
  out = out.replace(/“/g,'"').replace(/”/g,'"').replace(/"([^"]+)"/g,'"$1."');
  return out.trim();
}

function err(status, message){
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
