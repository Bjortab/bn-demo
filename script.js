// ======== Enkla UI-variabler ========
const levelBtns = document.querySelectorAll('.chip');
const voiceSel  = document.getElementById('voiceSel');
const preview   = document.getElementById('previewVoice');
const playIntro = document.getElementById('playIntro');
const rate      = document.getElementById('rate');
const idea      = document.getElementById('idea');
const createBtn = document.getElementById('createBtn');
const stopTTS   = document.getElementById('stopTTS');
const statusEl  = document.getElementById('status');
const output    = document.getElementById('output');
const storyText = document.getElementById('storyText');

const openConnect  = document.getElementById('openConnect');
const connectDlg   = document.getElementById('connectDlg');
const saveConnect  = document.getElementById('saveConnect');
const closeConnect = document.getElementById('closeConnect');
const aliasInput   = document.getElementById('alias');
const favLevelSel  = document.getElementById('favLevel');

let currentLevel = 1;

// ======== Nivåval ========
levelBtns.forEach(b=>{
  b.addEventListener('click', ()=>{
    levelBtns.forEach(x=>x.classList.remove('is-selected'));
    b.classList.add('is-selected');
    currentLevel = +b.dataset.level;
    localStorage.setItem('bn-level', String(currentLevel));
  });
});
const savedLvl = +localStorage.getItem('bn-level') || 1;
const defBtn = document.querySelector(`.chip[data-level="${savedLvl}"]`);
if(defBtn){ defBtn.click(); }

// ======== TTS (webbläsarens uppläsning) ========
const synth = window.speechSynthesis;
function getVoices(){
  if(!('speechSynthesis' in window)) return [];
  return synth.getVoices();
}
function populateVoices(){
  const voices = getVoices();
  voiceSel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value=''; auto.textContent='Auto (svenska om möjligt)';
  voiceSel.appendChild(auto);
  const sv = voices.filter(v=>/sv-SE/i.test(v.lang));
  const rest = voices.filter(v=>!sv.includes(v));
  sv.concat(rest).forEach(v=>{
    const o = document.createElement('option');
    o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
    voiceSel.appendChild(o);
  });
  const saved = localStorage.getItem('bn-voice');
  if(saved) voiceSel.value = saved;
}
if('speechSynthesis' in window){
  window.speechSynthesis.onvoiceschanged = populateVoices;
  setTimeout(populateVoices, 200);
}
voiceSel.addEventListener('change', ()=> localStorage.setItem('bn-voice', voiceSel.value));

function pickVoice(){
  const vs = getVoices();
  const chosen = vs.find(v=> v.name === voiceSel.value);
  if(chosen) return chosen;
  const sv = vs.find(v=>/sv-SE/i.test(v.lang));
  return sv || vs[0] || null;
}
function speak(text){
  if(!('speechSynthesis' in window)){ alert('Din webbläsare saknar talsyntes.'); return; }
  try{ synth.cancel(); }catch{}
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if(v) u.voice = v;
  u.lang = (v && v.lang) || 'sv-SE';
  u.rate = +rate.value || 1;
  synth.speak(u);
}

preview.addEventListener('click', ()=>{
  speak('Detta är ett kort röstprov. Luta dig tillbaka och lyssna.');
});
playIntro.addEventListener('click', ()=>{
  const intro = {
    1: 'Välkommen till Blush Narratives. Nivå ett är mjuk, romantisk och varsam.',
    3: 'Nivå tre är mer suggestiv och närvarande — fortfarande utan grafiska detaljer.',
    5: 'Nivå fem är intensiv i känslan, men håller en sensuell, antydande stil.'
  }[currentLevel];
  speak(intro);
});
stopTTS.addEventListener('click', ()=> { try{ synth.cancel(); }catch{} });

// ======== AI-koppling (via din Cloudflare Worker) ========
const PROXY_URL = (window.BN_PROXY_URL || '').trim(); // sätts i index.html
function setStatus(msg, ok=true){
  statusEl.textContent = msg;
  statusEl.style.color = ok ? '#9fe29f' : '#ff9f9f';
}

createBtn.addEventListener('click', async ()=>{
  const prompt = idea.value.trim();
  if(!prompt){ setStatus('Skriv en idé först.', false); return; }
  if(!PROXY_URL){ setStatus('PROXY_URL saknas. Sätt din Worker-URL i index.html.', false); return; }

  createBtn.disabled = true;
  setStatus('Skapar berättelse…');

  try{
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ prompt, level: currentLevel })
    });
    const data = await res.json();
    if(!res.ok || !data.text){
      throw new Error(data.error || 'Kunde inte skapa berättelsen.');
    }
    storyText.textContent = data.text;
    output.hidden = false;
    setStatus('Klar — läser upp…');
    speak(data.text);
  }catch(err){
    setStatus('Fel: ' + err.message, false);
  }finally{
    createBtn.disabled = false;
  }
});

// ======== Connect (mockup lokalt) ========
openConnect?.addEventListener('click', ()=>{
  aliasInput.value = localStorage.getItem('bn-alias') || '';
  favLevelSel.value = localStorage.getItem('bn-fav-level') || String(currentLevel);
  connectDlg.showModal();
});
closeConnect?.addEventListener('click', ()=> connectDlg.close());
saveConnect?.addEventListener('click', ()=>{
  localStorage.setItem('bn-alias', aliasInput.value.trim());
  localStorage.setItem('bn-fav-level', favLevelSel.value);
  connectDlg.close();
});