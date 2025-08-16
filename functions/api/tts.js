// functions/api/tts.js
module.exports = {
  async onRequestPost({ request, env }) {
    try {
      const { text = "", voice = "alloy", speed = 1.25 } = await request.json();
      if (!text) return new Response("empty_text", { status: 400 });
      if (!env.OPENAI_API_KEY) return new Response("missing_openai_key", { status: 500 });

      const body = {
        model: "gpt-4o-mini-tts",
        voice,
        input: text,
        speed
      };

      const r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (!r.ok) {
        const err = await r.text();
        return new Response(`tts_error:${err}`, { status: 502 });
      }

      const buf = await r.arrayBuffer();
      return new Response(buf, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store"
        }
      });
    } catch (e) {
      return new Response(`tts_crash:${String(e)}`, { status: 500 });
    }
  }
};
