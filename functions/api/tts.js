export default {
  async fetch(request, env) {
    try {
      const { text, voice, speed } = await request.json();

      if (!env.OPENAI_API_KEY) {
        return new Response(
          JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
          { status: 500 }
        );
      }

      // Skicka TTS-anrop till OpenAI
      const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice: voice || "alloy",
          input: text,
          speed: speed || 1.0
        })
      });

      if (!ttsResponse.ok) {
        const err = await ttsResponse.text();
        return new Response(
          JSON.stringify({ error: "TTS request failed", details: err }),
          { status: 500 }
        );
      }

      // Returnera ljudström som mp3
      return new Response(ttsResponse.body, {
        headers: { "Content-Type": "audio/mpeg" }
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Server error in TTS", details: err.message }),
        { status: 500 }
      );
    }
  }
};
