export async function onRequestPost({ request, env }) {
  const { text = '', voice = 'alloy', rate = 1.0 } = await readJson(request);
  if (!text || String(text).trim().length < 2) return j({ ok:false, error:'empty_text' }, 400);
  const key = env.OPENAI_API_KEY;
  if (!key) return j({ ok:false, error:'missing_openai_key' }, 500);

  try{
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method:'POST',
      headers:{ 'content-type':'application/json','authorization':`Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input: text,
        format: 'mp3'
      })
    });
    if(!r.ok){
      const txt = await r.text().catch(()=>r.statusText);
      return j({ ok:false, error:`openai_tts_${r.status}`, detail: txt }, 502);
    }
    const mp3 = await r.arrayBuffer();
    return new Response(mp3, {
      status:200,
      headers:{
        'content-type':'audio/mpeg',
        'cache-control':'no-store',
        'access-control-allow-origin':'*'
      }
    });
  }catch(err){
    return j({ ok:false, error:'server_error', detail:String(err?.message||err) }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin':'*',
      'access-control-allow-methods':'POST,OPTIONS',
      'access-control-allow-headers':'*'
    }
  });
}

async function readJson(req){ try { return await req.json(); } catch { return {}; } }
function j(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'access-control-allow-origin':'*'
    }
  });
}
