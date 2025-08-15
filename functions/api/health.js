export async function onRequestGet() {
  return new Response('ok', {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    }
  });
}
