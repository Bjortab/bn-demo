export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- CORS preflight (fix för bn-demo01.pages.dev) ---
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }
    // ---------------------------------------------------

    try {
      if (url.pathname === "/api/v1/health") {
        return new Response(
          JSON.stringify({ ok: true, service: "bn-worker" }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*", // CORS fix
            },
          }
        );
      }

      if (url.pathname === "/api/v1/status") {
        return new Response(
          JSON.stringify({
            providers: [
              { name: "OpenRouter", healthy: false, models: [] },
              { name: "Mistral", healthy: false },
              { name: "OpenAI", healthy: false },
            ],
            tts: [{ name: "ElevenLabs", healthy: false, tier: "EL" }],
            cache: { kv: "BN_AUDIO", r2: "bn-audio" },
            version: "v1.0.0",
            mock: true,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*", // CORS fix
            },
          }
        );
      }

      // --- Exempel på API endpoint: /api/v1/generate ---
      if (url.pathname === "/api/v1/generate" && request.method === "POST") {
        const body = await request.json();

        // Här skulle modellen anropas, just nu mock
        const result = {
          story: `Mockad berättelse för: ${body.prompt || "ingen prompt"}`,
        };

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*", // CORS fix
          },
        });
      }

      return new Response(
        JSON.stringify({ error: "Not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*", // CORS fix
          },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message || "Internal error" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*", // CORS fix
          },
        }
      );
    }
  },
};
