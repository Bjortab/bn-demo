import { corsHeaders, jsonResponse, badRequest, serverError } from './_utils.js';
import { sanitizeIdea, applyFilters } from './filters.js';

const OR_URL   = 'https://openrouter.ai/api/v1/chat/completions';
const OR_MODEL = 'mistralai/mixtral-8x7b-instruct';
const TIMEOUT_MS  = 120000;

function withTimeout(ms) { const ac=new AbortController(); const t=setTimeout(()=>ac.abort(new Error('timeout')),ms); return {signal:ac.signal,cancel:()=>clearTimeout(t)}; }
function targetWords(min){ return Math.max(200, Math.round((min||5)*130)); }

function levelStyle(level, lexHints=[]){
  const L=Number(level||3);
  const common=[
    'Skriv på idiomatisk svenska med korrekt grammatik.',
    'Tydlig båge: förväntan → stegring → avslut/efterspel.',
    'Undvik klyschor och upprepningar.',
    'Inga fysiska motsägelser för två personer.',
    'Första person (“jag”) om inte idén säger annat.'
  ];
  const densLow='Lexikonfraser sparsamt.'; const densHigh='Använd lexikonfraser där de passar, undvik upprepning.';
  if(L>=5) return [...common,'Nivå 5 (explicit): Direkt och erotisk utan våld. Grova ord tillåtna där de passar (t.ex. "kuk", "våt", "vagina").',densHigh,(lexHints.length?('Lexikon (inspiration): '+lexHints.join(' | ')):''),'Avsluta med tydligt efterspel och markera [SLUT].'].join(' ');
  if(L===4) return [...common,'Nivå 4 (het, ej grovt): het vuxenprosa; ord som lem, vagina, våt är ok. Undvik grovt/nedsättande.',densHigh,'Avrunda naturligt och markera [SLUT].'].join(' ');
  if(L===3) return [...common,'Nivå 3 (sensuell): heta scener utan explicita könsord. Fokus på beröring/andning/blickar/kyssar.',densLow,'Mjukt efterspel, markera [SLUT].'].join(' ');
  if(L===2) return [...common,'Nivå 2 (antydande): sensuell, antydande, ingen explicit anatomi.',densLow].join(' ');
  return [...common,'Nivå 1 (romantisk): fokus på känslor och närhet, ingen explicithet.',densLow].join(' ');
}
function buildUser({idea,level,minutes}) {
  const words=targetWords(minutes);
  return [`Idé (eventuellt maskerad): ${idea}`,`Omfattning: ~${words} ord.`,'Skriv som en sammanhängande berättelse, inga listor.','Avsluta med [SLUT].'].join('\n');
}

// Providers
async function callOpenRouter(env,{sys,user,maxTokens}){
  if(!env.OPENROUTER_API_KEY) throw new Error('saknar OPENROUTER_API_KEY');
  const {signal,cancel}=withTimeout(TIMEOUT_MS);
  const res=await fetch(OR_URL,{method:'POST',signal,headers:{
    'Authorization':`Bearer ${env.OPENROUTER_API_KEY}`,
    'Content-Type':'application/json','HTTP-Referer':'https://bn-demo01.pages.dev','X-Title':'Blush Narratives'
  },body:JSON.stringify({model:OR_MODEL,temperature:0.85,top_p:0.9,max_tokens:maxTokens,messages:[
    {role:'system',content:sys},{role:'user',content:user}
  ]})});
  const txt=await res.text().catch(()=> ''); cancel();
  if(res.status===402) throw new Error(`openrouter_402:${txt||''}`);
  if(!res.ok) throw new Error(`openrouter_${res.status}:${txt||''}`);
  const data=JSON.parse(txt||'{}'); const out=data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
  if(!out) throw new Error('tomt svar från OpenRouter');
  return { text: out, provider:'openrouter', model: OR_MODEL };
}
async function callMistral(env,{sys,user,maxTokens}){
  if(!env.MISTRAL_API_KEY) throw new Error('saknar MISTRAL_API_KEY');
  const {signal,cancel}=withTimeout(90000);
  const res=await fetch('https://api.mistral.ai/v1/chat/completions',{method:'POST',signal,headers:{
    'Authorization':`Bearer ${env.MISTRAL_API_KEY}`,'Content-Type':'application/json'
  },body:JSON.stringify({model:'mistral-large-latest',temperature:0.9,max_tokens:maxTokens,messages:[{role:'system',content:sys},{role:'user',content:user}]})});
  const txt=await res.text().catch(()=> ''); cancel();
  if(!res.ok) throw new Error(`mistral_${res.status}:${txt}`);
  const data=JSON.parse(txt||'{}'); const out=data?.choices?.[0]?.message?.content || '';
  if(!out) throw new Error('tomt svar från Mistral');
  return { text: out, provider:'mistral', model:'mistral-large-latest' };
}
async function callOpenAI(env,{sys,user,maxTokens}){
  if(!env.OPENAI_API_KEY) throw new Error('saknar OPENAI_API_KEY');
  const {signal,cancel}=withTimeout(90000);
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal,headers:{
    'Authorization':`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'
  },body:JSON.stringify({model:'gpt-4o-mini',temperature:0.9,max_output_tokens:maxTokens,input:[{role:'system',content:sys},{role:'user',content:user}]})});
  const txt=await res.text().catch(()=> ''); cancel();
  if(!res.ok) throw new Error(`openai_${res.status}:${txt}`);
  const data=JSON.parse(txt||'{}'); const out=data?.output?.[0]?.content?.[0]?.text || data?.output_text || '';
  if(!out) throw new Error('tomt svar från OpenAI');
  return { text: out, provider:'openai', model:'gpt-4o-mini' };
}

// Route
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(()=>null);
    if(!body) return badRequest('saknar JSON', request);

    let { idea='', level=3, minutes=5, lexHints=[] } = body;

    // FÖRE: sanera idén
    const pre = sanitizeIdea(idea);
    if(!pre.ok) {
      if(pre.reason==='minors') return badRequest('Otillåtet innehåll (minderåriga).', request);
      return badRequest('Ogiltig idé.', request);
    }
    idea = pre.idea;
    const preWarnings = pre.warnings || [];

    const sys = levelStyle(Number(level), Array.isArray(lexHints) ? lexHints : []);
    const user = buildUser({ idea, level, minutes });
    const maxTokens = Math.min(3500, Math.max(800, Math.round(targetWords(minutes) * 1.6)));

    // Provider chain
    let result;
    try {
      result = await callOpenRouter(env, { sys, user, maxTokens });
    } catch(e) {
      const msg = String(e?.message || e);
      if (msg.startsWith('openrouter_402') || /openrouter_(429|5\d\d)/.test(msg)) {
        if(env.MISTRAL_API_KEY) { try { result = await callMistral(env,{sys,user,maxTokens}); } catch{} }
        if(!result && env.OPENAI_API_KEY) { result = await callOpenAI(env,{sys,user,maxTokens}); }
        if(!result) throw e;
      } else {
        if(env.MISTRAL_API_KEY) { try { result = await callMistral(env,{sys,user,maxTokens}); } catch{} }
        if(!result && env.OPENAI_API_KEY) { result = await callOpenAI(env,{sys,user,maxTokens}); }
        if(!result) throw e;
      }
    }

    // EFTER: filtrera output
    const post = applyFilters(result.text, { level, persons: 2 });
    if(!post.ok) {
      if(post.reason==='minors') return badRequest('Otillåtet innehåll i generering (minderåriga).', request);
      return badRequest('Genereringen innehöll otillåtet innehåll.', request);
    }
    const warnings = [...preWarnings, ...(post.warnings || [])];

    return jsonResponse({ ok:true, text:post.text, provider:result.provider, model:result.model, warnings }, 200, request);
  } catch(err) {
    return serverError(err, request);
  }
}

export async function onRequestOptions({ request }) { return new Response(null, { headers: corsHeaders(request) }); }
export async function onRequestGet({ request }) { return jsonResponse({ ok:true, service:'generate', at:Date.now() }, 200, request); }
