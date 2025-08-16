import { cors, options, notAllowed } from './_utils';

export async function onRequest(context){
  const { request, env } = context;
  if(request.method === 'OPTIONS') return options();
  if(request.method !== 'POST') return notAllowed(['POST','OPTIONS']);

  try{
    const { text, voice='alloy' } = await request.json();
    if(!text || !String(text).trim()){
      return new Response(JSON.stringify({ error:'Ingen text att läsa upp' }), {
        status:400,
        headers: { 'content-type':'application/json', ...cors() }
      });
    }

    // OpenAI TTS
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method:'POST',
      headers:{
        'content-type':'application/json',
        'authorization': `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input: text,
        format: 'mp3'
      })
    });

    if(!resp.ok){
      const err = await resp.text();
      return new Response(JSON.stringify({ error:`OpenAI TTS: ${resp.status} ${err.slice(0,400)}` }), {
        status:502,
        headers:{ 'content-type':'application/json', ...cors() }
      });
    }

    // Strömma ut MP3 till klienten
    const headers = new Headers(cors());
    headers.set('content-type','audio/mpeg');
    headers.set('cache-control','no-store');
    return new Response(resp.body, { status:200, headers });
  }catch(e){
    return new Response(JSON.stringify({ error: e.message || 'TTS-fel' }), {
      status:500,
      headers:{ 'content-type':'application/json', ...cors() }
    });
  }
}
