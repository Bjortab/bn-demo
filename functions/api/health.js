// functions/api/health.js
export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, t: Date.now() }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
