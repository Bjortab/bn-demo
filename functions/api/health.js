// functions/api/health.js
export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, time: new Date().toISOString() }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
