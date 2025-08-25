// ---------- helpers ----------
const $ = (sel, root=document)=>root.querySelector(sel);
const $$ = (sel, root=document)=>[...root.querySelectorAll(sel)];
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

const state = {
  level:3, minutes:3, voice:'alloy', rate:1.0,
  storyText:'', audio:null, lexicon:[], tag:'alla',
  apiOnline:false
};

// ---------- init ----------
window.addEventListener('DOMContentLoaded', async ()=>{
  // tempo
  $('#tempo').addEventListener('input', e=>{
    state.rate = Number(e.target.value);
    $('#tempoVal').textContent = state.rate.toFixed(2)+'×';
  });
  // voice
  $('#voiceSel').addEventListener('change', e=> state.voice = e.target.value);

  // nivå
  $$('.level-row .chip').forEach(b=>{
    b.addEventListener('click', ()=>{
      $$('.level-row .chip').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); state.level = Number(b.dataset.level);
    });
  });
  // längd
  $$('#lenGroup .seg-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      $$('#lenGroup .seg-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); state.minutes = Number(b.dataset.len);
    });
  });
  // default UI
  $(`.level-row .chip[data-level="3"]`)?.classList.add('active');
  $(`#lenGroup .seg-btn[data-len="3"]`)?.classList.add('active');

  // actions
  $('#btnGenerate').addEventListener('click', onGenerate);
  $('#btnListen').addEventListener('click', onListen);
  $('#btnStop').addEventListener('click', onStop);

  // dialogs
  $('#btnApiKey').addEventListener('click', openApiDialog);
  $('#saveApiBtn').addEventListener('click', saveApiKey);
  $('#btnRescue').addEventListener('click', openRescue);

  // tags
  $$('#tagRow .chip').forEach(ch=>{
    ch.addEventListener('click', ()=>{
      $$('#tagRow .chip').forEach(x=>x.classList.remove('active'));
      ch.classList.add('active'); state.tag = ch.dataset.tag; renderCards();
    });
  });

  // health (om Pages Functions finns)
  try {
    const h = await fetch('/api/health?'+Date.now(), {cache:'no-store'});
    state.apiOnline = h.ok;
  } catch { state.apiOnline = false; }

  // lexikon
  try{
    const res = await fetch('lexicon.json?'+Date.now());
    state.lexicon = await res.json();
  }catch{ state.lexicon=[]; }
  renderCards();

  console.log('BN v0.5.0', {apiOnline: state.apiOnline});
});

// ---------- API-nyckel dialog (för TTS i klienten) ----------
function openApiDialog(){
  $('#apiInput').value = localStorage.getItem('OPENAI_API_KEY') || '';
  $('#apiDlg').showModal();
}
function saveApiKey(e){
  e.preventDefault();
  const v = $('#apiInput').value.trim();
  if(!v.startsWith('sk-')) { alert('Ogiltig nyckel (börjar inte med sk-)'); return; }
  localStorage.setItem('OPENAI_API_KEY', v);
  $('#apiDlg').close();
}

// ---------- Rescue ----------
function openRescue(){
  const dlg = $('#rescDlg');
  const k = localStorage.getItem('OPENAI_API_KEY') || '';
  $('#maskKey').textContent = k ? k.slice(0,6)+'…'+k.slice(-4) : '(saknas)';
  $('#rescueSpeak').onclick = async (ev)=>{
    ev.preventDefault();
    try { await playTTS('Detta är ett test av rösten i Blush Narratives.', 'alloy', 1.0); }
    catch(err){ alert('TTS-fel: '+err.message); }
  };
  dlg.showModal();
}

// ---------- Rekommenderat ----------
function renderCards(){
  const cont = $('#cards'); cont.innerHTML = '';
  const items = state.lexicon.filter(x=> state.tag==='alla' || x.tags.includes(state.tag));
  for(const it of items){
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="title">${it.title}</div>
      <div class="desc">${it.desc}</div>
      <div class="tags">${it.tags.map(t=>`<span class="badge">${t}</span>`).join(' ')}</div>
      <div class="row">
        <div class="row gap">
          <button class="btn ghost btnSave">Spara</button>
          <button class="btn btnListen">Lyssna</button>
        </div>
        <span class="muted">${it.length || '3–5 min'}</span>
      </div>`;
    card.querySelector('.btnListen').addEventListener('click', async ()=>{
      await generateOnlineOrFallback(`${it.title} — ${it.desc}`);
      await onListen();
    });
    card.querySelector('.btnSave').addEventListener('click', ()=>{
      const favs = JSON.parse(localStorage.getItem('BN_FAV')||'[]');
      favs.push({t:it.title, d:it.desc, ts:Date.now()});
      localStorage.setItem('BN_FAV', JSON.stringify(favs));
    });
    cont.appendChild(card);
  }
}

// ---------- Generering ----------
function buildPrompt(idea, level, minutes){
  const toneByLevel = {
    1:'romantisk, mjuk och subtil',
    2:'romantisk med sensuella undertoner',
    3:'sensuell och närvarande, vuxen nivå',
    4:'tydligt sensuell med vuxet språk',
    5:'mycket explicit vuxet språk, hög intensitet (lagligt & samtycke)'
  };
  const len = {1:'kort',3:'mellan',5:'längre'}[minutes] || 'mellan';
  return `Skriv en ${len} svensk berättelse i jag-form.
Stil: ${toneByLevel[level]}.
Utgå från idén: ${idea || '(ingen idé)'}.
Avsluta mjukt.`;
}

async function generateOnlineOrFallback(idea){
  $('#status').textContent = state.apiOnline ? 'Genererar (OpenAI)…' : 'Genererar (lokalt)…';
  if (state.apiOnline) {
    try {
      const res = await fetch('/api/generate', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({ prompt: idea, level: state.level, minutes: state.minutes })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data.text) {
          state.storyText = data.text.trim();
          $('#storyOut').textContent = state.storyText;
          $('#status').textContent = 'Klar';
          return;
        }
      }
      console.warn('API fallback — ogiltigt svar');
    } catch (e) {
      console.warn('API fallback — nätfel', e);
    }
  }
  // Lokalt (fallback)
  const text = synthLocalText(buildPrompt(idea, state.level, state.minutes));
  state.storyText = text;
  $('#storyOut').textContent = text;
  $('#status').textContent = 'Klar (lokalt)';
}

function synthLocalText(seed){
  const base = {
    1:"Hon såg mig och log. Luften var mjuk och kvällen stilla. Vi tog det långsamt, ett steg i taget…",
    2:"Hennes hand fann min. Närheten växte, andetagen blev varmare. Vi hittade ett lugnt tempo…",
    3:"Vi kom närmare, huden svarade på minsta rörelse. Rösten bar värmen och blicken stannade…",
    4:"Värmen slog upp mellan oss, beröringen blev tydlig och orden djärva. Inget dolt, bara vi…",
    5:"Intensiteten tog över. Språket var naket och vuxet, varje rörelse uttalades utan skygglappar…"
  }[state.level] || "";
  const blocks = Math.max(3, Math.min(9, state.minutes*3));
  let out = `(${state.minutes} min, nivå ${state.level})\n\n${base}\n\n`;
  for(let i=0;i<blocks;i++) out += base.replace('…','.') + '\n\n';
  return out.trim();
}

async function onGenerate(){
  disable(true);
  const idea = $('#idea').value.trim();
  try { await generateOnlineOrFallback(idea); }
  catch(e){ alert(e.message||'Fel vid generering'); }
  finally { disable(false); }
}

// ---------- TTS ----------
async function onListen(){
  const text = state.storyText || $('#storyOut').textContent.trim();
  if(!text){ alert('Ingen text att läsa.'); return; }
  disable(true);
  try { await playTTS(text, state.voice, state.rate); }
  finally { disable(false); }
}

async function playTTS(text, voice='alloy', rate=1.0){
  const key = localStorage.getItem('OPENAI_API_KEY');
  if (!key) throw new Error('Spara din OpenAI-nyckel via knappen “API-nyckel”.');
  const st = $('#ttsStatus'); st.textContent='Laddar röst…';
  if (state.audio) try { state.audio.pause(); } catch {}
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method:'POST',
    headers:{'content-type':'application/json', authorization:`Bearer ${key}`},
    body: JSON.stringify({ model:'gpt-4o-mini-tts', voice, input:text, format:'mp3', speed:Math.max(0.5,Math.min(2.0,rate)) }),
  });
  if (!res.ok) { st.textContent=''; return speakFallback(text, rate); }
  const blob = await res.blob(); const url = URL.createObjectURL(blob);
  const audio = new Audio(url); audio.preload='auto';
  audio.onended=()=>{ st.textContent=''; URL.revokeObjectURL(url); };
  audio.onerror=()=>{ st.textContent=''; speakFallback(text, rate); };
  await audio.play(); state.audio = audio; st.textContent='Spelar…';
}

function speakFallback(text, rate=1.0){
  const s = window.speechSynthesis; const st = $('#ttsStatus');
  if (!s) { alert('Ingen TTS-motor tillgänglig.'); return; }
  s.cancel(); const u = new SpeechSynthesisUtterance(text);
  u.lang='sv-SE'; u.rate=Math.max(0.8,Math.min(1.4,rate));
  u.onstart=()=>st.textContent='Spelar (fallback)…'; u.onend=()=>st.textContent='';
  s.speak(u);
}

// ---------- stop & UI ----------
function onStop(){
  $('#ttsStatus').textContent='';
  try { if(state.audio){ state.audio.pause(); state.audio=null; } window.speechSynthesis?.cancel(); } catch {}
}
function disable(b){
  ['btnGenerate','btnListen','btnStop'].forEach(id=>{
    const el = $('#'+id); el.disabled=b; el.classList.toggle('disabled',b);
  });
  $('#status').textContent = b ? 'Jobbar…' : '';
}
