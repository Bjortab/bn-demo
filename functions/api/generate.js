import { json, options, notAllowed } from './_utils';

const SYS_BASE = `Du är en svensk berättarröst som skriver sensuella ljudnoveller.
- Alltid samtycke, vuxna, inga minderåriga, ingen våldtfantasi, ingen icke-samtyckande handling.
- Nivå 1–5 styr explicitet. 1 = romantiskt och icke-grafiskt; 5 = mest explicit (vuxet, grafiskt språk).
- Håll prosan flytande och mänsklig. Undvik upprepningar och korthuggen rytm.
- Skriv alltid i jag-form när det passar.`;

function spiceHints(level){
  switch(Number(level)){
    case 1: return 'Håll det varmt och romantiskt. Undvik grafiska ord.';
    case 2: return 'Sensuellt och tydligt, men fortfarande icke-grafiskt.';
    case 3: return 'Sensuellt + vissa explicita antydningar, men inte full vocabulary.';
    case 4: return 'Explicit vuxet språk tillåtet (lem, slida, våt, kyssa, slicka).';
    case 5: return 'Mest explicit (vuxet). Ord som kuk, fitta, knulla får förekomma. Fortsatt respektfull ton och samtycke.';
    default: return 'Neutral nivå.';
  }
}

export async function onRequest(context){
  const { request, env } = context;
  if(request.method === 'OPTIONS') return options();
  if(request.method !== 'POST') return notAllowed(['POST','OPTIONS']);

  try{
    const { idea, minutes=5, spice=2 } = await request.json();
    if(!idea || !String(idea).trim()) return json({ error:'Tom prompt' }, 400);

    const words = Math.max(80, Math.round(Number(minutes)*170));
    const sys = `${SYS_BASE}\n\nNivå: ${spice}. ${spiceHints(spice)}\nMål-längd: ca ${words} ord.`;
    const user = `Idé: ${idea}\nSkriv en sammanhängande berättelse (svenska). Ge även ett 2–3 meningars utdrag i början.`;

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{
        'content-type':'application/json',
        'authorization': `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          { role:'system', content: sys },
          { role:'user', content: user }
        ],
        max_output_tokens: Math.min(4096, Math.round(words*2.2)),
        temperature: 0.9
      })
    });

    if(!resp.ok){
      const err = await resp.text();
      return json({ error:`OpenAI: ${resp.status} ${err.slice(0,500)}` }, 502);
    }
    const data = await resp.json();
    const full = data?.output?.[0]?.content?.[0]?.text
              || data?.output_text
              || '';

    if(!full) return json({ error:'Tomt svar från OpenAI' }, 502);

    // Utdrag = första stycket eller 400 tecken
    const excerpt = full.split(/\n{2,}/)[0].slice(0, 600);

    return json({ text: full, excerpt });
  }catch(e){
    return json({ error: e.message || 'Internt fel' }, 500);
  }
}
