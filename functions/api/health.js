export function onRequestGet() {
  return new Response(JSON.stringify({ ok:true, ts: Date.now() }), {
    headers:{ 'content-type':'application/json','access-control-allow-origin':'*' }
  });
}
export function onRequestOptions() {
  return new Response(null, {
    status:204,
    headers:{
      'access-control-allow-origin':'*',
      'access-control-allow-methods':'GET,OPTIONS',
      'access-control-allow-headers':'*'
    }
  });
}
