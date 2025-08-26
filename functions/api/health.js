export const onRequestGet = async () => {
  try {
    // Kolla om OpenAI-nyckeln är tillgänglig
    const key = process.env.OPENAI_API_KEY;
    let openaiOk = false;

    if (key) {
      try {
        const resp = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` }
        });
        openaiOk = resp.ok;
      } catch {
        openaiOk = false;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        openai: openaiOk,
        v: "1.0",
        ts: Date.now()
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      headers: { "content-type": "application/json" },
      status: 500
    });
  }
};
