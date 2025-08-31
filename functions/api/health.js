export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, service: 'health', at: Date.now() }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
export const onRequestOptions = onRequestGet;
export const onRequestPost = onRequestGet;
