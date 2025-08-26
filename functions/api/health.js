export async function onRequestGet() {
  return new Response(JSON.stringify({ ok:true, v:"1.0", ts: Date.now() }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control":"no-store" }
  });
}
