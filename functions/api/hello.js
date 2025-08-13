export async function onRequest({ request }) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name') || 'världen';
  return new Response(`Hej ${name}!`, { headers: { 'content-type': 'text/plain' }});
}
