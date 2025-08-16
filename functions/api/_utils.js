export function json(body, status=200, extraHeaders={}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type':'application/json; charset=utf-8', ...cors(), ...extraHeaders }
  });
}
export function text(body, status=200, extraHeaders={}) {
  return new Response(body, { status, headers: { 'content-type':'text/plain; charset=utf-8', ...cors(), ...extraHeaders }});
}
export function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization'
  };
}
export function options() { return new Response(null, { status:204, headers: cors() }); }
export function notAllowed(methods=['POST']) {
  return text('Method Not Allowed', 405, { 'allow': methods.join(',') });
}
