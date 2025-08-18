export default {
  async fetch(request, env) {
    return new Response(
      JSON.stringify({
        ok: true,
        tts: env.OPENAI_API_KEY ? "openai" : "not_configured",
        time: new Date().toISOString()
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
};
