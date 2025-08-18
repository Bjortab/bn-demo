// /functions/api/tts.js
// OpenAI TTS → MP3 (mobilvänligt). CORS + timeout.
export default {
  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { "access-control-allow-origin": "*" }
        });
      }
      if (!env.OPENAI_API_KEY) {
        return new Response(JSON.stringify({ error:"Missing OPENAI_API_KEY" }), {
          status: 500,
          headers: { "content-type":"application/json", "access-control-allow-origin":"*" }
        });
      }
      const { text, voice="verse", speed=1.0 } = await request.json();
      const input = String(text||"").trim();
      if (!input) {
        return new Response(JSON.stringify({ error:"empty_text" }), {
          status: 400, headers: { "content-type":"application/json", "access-control-allow-origin":"*" }
        });
      }

      const ctrl = new AbortController();
      const timer = setTimeout(()=>ctrl.abort("timeout"), 65000);

      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method:"POST",
        headers:{
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice,
          input,
          speed: Math.max(0.5, Math.min(2.0, Number(speed)||1.0)),
          format: "mp3"
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);

      if (!res.ok) {
        const err = await res.text().catch(()=> "");
        return new Response(JSON.stringify({ error:"tts_failed", detail: err }), {
          status: 502, headers: { "content-type":"application/json", "access-control-allow-origin":"*" }
        });
      }

      return new Response(res.body, {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "cache-control": "no-store",
          "access-control-allow-origin": "*"
        }
      });

    } catch (err) {
      const msg = (err?.message||"").includes("timeout") ? "timeout" : (err?.message||"server_error");
      return new Response(JSON.stringify({ error:"server_error", detail: msg }), {
        status: 500, headers: { "content-type":"application/json", "access-control-allow-origin":"*" }
      });
    }
  }
};
