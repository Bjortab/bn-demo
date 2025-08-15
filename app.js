// ======= Ställ in din Cloudflare Pages-bas här =======
const API_BASE = 'https://DIN-CLOUDFLARE-PAGES.DOMÄN'; // ex: https://bn-demo01.pages.dev
// =====================================================

const els = {
  length: document.getElementById('length'),
  spice: document.getElementById('spice'),
  voice: document.getElementById('voice'),
  words: document.getElementById('words'),
  prompt: document.getElementById('prompt'),
  btnPreview: document.getElementById('btnPreview'),
  btnRead: document.getElementById('btnRead'),
  btnDownload: document.getElementById('btnDownload'),
  status: document.getElementById('status'),
  excerpt: document.getElementById('excerpt'),
  player: document.getElementById('player')
};

function calcWords(mins){ return mins*170; }
function updateWords(){ els.words.textContent = calcWords(Number(els.length.value)); }
['change','input'].forEach(evt=> els.length.addEventListener(evt, updateWords));
updateWords();

function uiStatus(msg='', isError=false){
  els.status.textContent = msg;
  els.status.style.color = isError ? '#ff7b7b' : '#9cd67b';
}

async function api(path, payload, asBlob=false){
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error(`${res.status}: ${t}`);
  }
  return asBlob ? res.blob() : res.json();
}

async function doGenerate(){
  uiStatus('Skapar berättelse…');
  const minutes = Number(els.length.value);
  const spice = Number(els.spice.value);
  const prompt = els.prompt.value?.trim() || 'Skriv en varm, romantisk novell.';
  const data = await api('/api/generate', { minutes, spice, prompt });
  const text = data.text || '';
  els.excerpt.textContent = text.slice(0, 600) + (text.length>600 ? '…' : '');
  return text;
}

async function doTTS(text){
  uiStatus('Skapar ljud…');
  const voice = els.voice.value || 'alloy';
  const blob = await api('/api/tts', { text, voice }, true);
  const url = URL.createObjectURL(blob);
  els.player.src = url;
  els.player.play().catch(()=>{ /* autoplay block */ });
  uiStatus('Klart.');
}

els.btnPreview.addEventListener('click', async ()=>{
  try{
    const text = await doGenerate();
    uiStatus('Utdrag genererat.');
  }catch(e){ uiStatus('Generate failed: '+e.message, true); }
});

els.btnRead.addEventListener('click', async ()=>{
  try{
    const text = await doGenerate();
    await doTTS(text);
  }catch(e){ uiStatus('Generate failed: '+e.message, true); }
});

els.btnDownload.addEventListener('click', async ()=>{
  try{
    const text = await doGenerate();
    const blob = new Blob([text], { type:'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'berattelse.txt';
    a.click();
  }catch(e){ uiStatus('Download failed: '+e.message, true); }
});
