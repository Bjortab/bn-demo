/* BN – förbättrad TTS:
   - chunkad uppläsning (funkar bättre i iOS/Safari på långa texter)
   - Stoppa-knapp
   - resten: samma UI som du redan kör
*/

let currentLevel = Number(localStorage.getItem('bn.level') || 1);
let detail = Number(localStorage.getItem('bn.detail') || 50);
let volume = Number(localStorage.getItem('bn.volume') || 0.6);
let currentVoice = localStorage.getItem('bn.voice') || null;
let lastStoryText = '';
let aiOnline = false;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 2400);
}

// Modal “Kommer snart”
const soonDlg = $('#soonModal');
$('#closeSoon')?.addEventListener('click', () => soonDlg.close());
$$('[data-soon]').forEach(el => el.addEventListener('click', () => !soonDlg.open && soonDlg.showModal()));

// Nav smooth scroll + favs render
$$('.topnav .navlink').forEach((a) => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    if (href && href.startsWith('#')) {
      e.preventDefault();
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
      $$('.navlink').forEach(n => n.classList.remove('active'));
      a.classList.add('active');
      if (href === '#favorites') renderFavs();
    }
  });
});

// AI status chip
function setAIStatus(online){
  aiOnline = online;
  const chip = $('#aiStatus');
  chip.textContent = online ? 'AI: Online' : 'AI: Lokal';
  chip.classList.toggle('online', online);
  chip.classList.toggle('offline', !online);
}

// Nivå
function syncLevelUI(){
  $$('.level-chip').forEach(b=>{
    const sel = Number(b.dataset.level) === currentLevel;
    b.classList.toggle('selected', sel);
    b.setAttribute('aria-pressed', sel ? 'true' : 'false');
  });
}
syncLevelUI();
$$('.level-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentLevel = Number(btn.dataset.level);
    localStorage.setItem('bn.level', String(currentLevel));
    syncLevelUI();
    toast(`Nivå ${currentLevel} vald`);
  });
});

// Reglage
const detailEl = $('#detail'); const detailOut = $('#detailOut');
detailEl.value = detail; detailOut.textContent = detail;
detailEl.addEventListener('input', (e) => {
  detail = Number(e.target.value);
  localStorage.setItem('bn.detail', String(detail));
  detailOut.textContent = detail;
});

const volEl = $('#volume'); const volOut = $('#volOut');
volEl.value = Math.round(volume*100); volOut.textContent = volEl.value;
volEl.addEventListener('input', (e) => {
  volume = Number(e.target.value)/100;
  localStorage.setItem('bn.volume', String(volume));
  volOut.textContent = e.target.value;
});

// TTS – röstval
const voiceSelect = $('#voiceSelect');
const testVoiceBtn = $('#testVoice');

function loadVoices(){
  const all = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
  const voices = all.filter(v => v.lang?.toLowerCase().startsWith('sv') || v.lang?.toLowerCase().startsWith('en'));
  voiceSelect.innerHTML = '';
  voices.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.name; opt.textContent = `${v.name} (${v.lang})`;
    voiceSelect.appendChild(opt);
  });
  let chosen = voices.find(v => v.name === currentVoice);
  if (!chosen) {
    chosen = voices.find(v => v.lang?.toLowerCase().startsWith('sv')) || voices[0] || null;
  }
  currentVoice = chosen?.name || null;
  if (currentVoice) voiceSelect.value = currentVoice;
}
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
} else {
  voiceSelect.disabled = true;
  testVoiceBtn.disabled = true;
  toast('TTS saknas i denna webbläsare.');
}

voiceSelect.addEventListener('change', ()=>{
  currentVoice = voiceSelect.value;
  localStorage.setItem('bn.voice', currentVoice);
});

// ---- Ny: chunkad uppläsning + Stoppa
let speakingQueue = [];
let speakingActive = false;

function stopSpeaking(){
  if (!('speechSynthesis' in window)) return;
  speakingQueue = [];
  speakingActive = false;
  window.speechSynthesis.cancel();
}

function speakChunked(text){
  if (!('speechSynthesis' in window)) { toast('Ingen TTS i denna webbläsare.'); return; }
  stopSpeaking(); // rensa ev. tidigare
  // Dela upp i meningar/lagom bitar
  const parts = text
    .replace(/\n+/g, ' ')
    .split(/([.!?…]+)\s+/) // behåll skiljetecken
    .reduce((acc, cur, i, arr)=>{
      if (i % 2 === 0) {
        const sentence = (cur + (arr[i+1] || '')).trim();
        if (sentence) acc.push(sentence);
      }
      return acc;
    }, [])
    .flatMap(s => s.length > 280 ? s.match(/.{1,280}(\s|$)/g).map(x=>x.trim()) : [s]); // max ~280 tecken per del

  speakingQueue = parts;
  speakingActive = true;

  const v = speechSynthesis.getVoices().find(x => x.name === currentVoice);
  const speakNext = () => {
    if (!speakingActive || speakingQueue.length === 0) { speakingActive = false; return; }
    const chunk = speakingQueue.shift();
    const u = new SpeechSynthesisUtterance(chunk);
    if (v) u.voice = v;
    u.lang = (v?.lang || 'sv-SE');
    u.volume = volume;
    u.onend = () => setTimeout(speakNext, 40); // liten paus
    u.onerror = () => setTimeout(speakNext, 80);
    // Safari/iOS hack: lite delay efter cancel innan start
    setTimeout(()=> window.speechSynthesis.speak(u), 20);
  };
  speakNext();
}

testVoiceBtn.addEventListener('click', ()=>{
  speakChunked('Detta är en förhandslyssning av vald röst i Blush Narratives.');
});

// Text-ton (lokal) + verktyg
function blendTone(level, detailPct) {
  const base = {
    1: ["varma blickar", "lätta beröringar", "romantisk ton"],
    3: ["pirrig nyfikenhet", "långsamma andetag", "förväntansfull stämning"],
    5: ["otålig lust", "handfasta rörelser", "nakna erkännanden"]
  }[level];
  const ix = Math.min(2, Math.floor(detailPct / 50));
  return [ base[0], detailPct < 50 ? base[1] : base[ix], base[ix] ];
}
function targetWordCount(mins){ return Math.round(mins * 170); }
function localDraftFromPrompt(prompt, level, detailPct, mins){
  const words = targetWordCount(mins);
  const [a,b,c] = blendTone(level, detailPct);
  const base = prompt.trim() || "En oväntad kväll";
  const p1 = `${base}. I skymningen möttes ni, där ${a} sa mer än ord.`;
  const p2 = `Rummet fylldes av ${b}, och ni vågade stanna upp, nära.`;
  const p3 = `Med ${c} närvarande tog kvällen sin riktning – detaljer växer naturligt.`;
  return `${[p1,p2,p3].join(' ')}\n\n[Demo – mållängd ≈ ${words} ord. Backend fyller ut hela texten när AI är på.]`;
}

// Skapa berättelse
const ideaEl = $('#idea');
const durationEl = $('#duration');
const createBtn = $('#createBtn');
const resultEl = $('#result');
const actionsBar = $('#actionsBar');
const readBtn = $('#readBtn');
const stopBtn = $('#stopBtn');
const copyBtn = $('#copyBtn');
const downloadBtn = $('#downloadBtn');
const favBtn = $('#favBtn');

function setLoading(btn, on) { btn.classList.toggle('loading', on); btn.disabled = on; }

async function handleCreate(){
  const idea = ideaEl.value.trim();
  if(!idea){ ideaEl.focus(); toast('Skriv en idé först.'); return; }
  setLoading(createBtn, true);
  resultEl.hidden = false;
  resultEl.textContent = 'Skapar berättelse...';

  const mins = Number(durationEl.value || '5');

  let usedBackend = false;
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: idea, level: currentLevel, detail, minutes: mins })
    });
    if (!res.ok) throw new Error('Backend svarade inte OK');
    const data = await res.json();
    lastStoryText = data?.text || '';
    if (!lastStoryText) throw new Error('Saknar text');
    resultEl.textContent = lastStoryText;
    usedBackend = data?.source === 'ai';
  } catch {
    lastStoryText = localDraftFromPrompt(idea, currentLevel, detail, mins);
    resultEl.textContent = lastStoryText;
  }

  setAIStatus(usedBackend);
  actionsBar.hidden = false;
  readBtn.disabled = false;
  setLoading(createBtn, false);
  toast('Berättelse klar.');
}

createBtn.addEventListener('click', handleCreate);
ideaEl.addEventListener('keydown', (e)=>{
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'enter') {
    e.preventDefault(); handleCreate();
  }
});

// Efter-generering
readBtn.addEventListener('click', ()=> {
  if (!lastStoryText) { toast('Skapa en berättelse först.'); return; }
  speakChunked(lastStoryText);
});
stopBtn.addEventListener('click', stopSpeaking);

copyBtn.addEventListener('click', async ()=>{
  if (!lastStoryText) return;
  try { await navigator.clipboard.writeText(lastStoryText); toast('Text kopierad.'); }
  catch { toast('Kunde inte kopiera.'); }
});
downloadBtn.addEventListener('click', ()=>{
  if (!lastStoryText) return;
  const blob = new Blob([lastStoryText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'blush-narratives.txt';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

// Favoriter
function getFavs(){ try{return JSON.parse(localStorage.getItem('bn.favs')||'[]')}catch{ return [] } }
function setFavs(list){ localStorage.setItem('bn.favs', JSON.stringify(list)); }
favBtn.addEventListener('click', ()=>{
  if (!lastStoryText) return;
  const list = getFavs();
  list.unshift({
    id: Date.now(),
    level: currentLevel,
    detail,
    text: lastStoryText.slice(0, 20000),
    ts: new Date().toISOString()
  });
  setFavs(list.slice(0, 200));
  toast('Sparad i favoriter.');
  renderFavs();
});

const favsList = $('#favsList');
function renderFavs(){
  const list = getFavs();
  favsList.innerHTML = '';
  if (list.length === 0){
    favsList.classList.add('empty');
    favsList.innerHTML = '<p class="muted">Inga favoriter ännu.</p>';
    return;
  }
  favsList.classList.remove('empty');

  list.forEach(item=>{
    const wrap = document.createElement('div');
    wrap.className = 'fav';
    const title = (item.text.split('\n')[0] || 'Berättelse').slice(0, 80);
    wrap.innerHTML = `
      <h4>${title}</h4>
      <div class="meta">Nivå ${item.level} • Detalj ${item.detail}% • ${new Date(item.ts).toLocaleString()}</div>
      <p>${item.text}</p>
      <div class="row">
        <button class="btn play">Läs upp</button>
        <button class="btn del">Ta bort</button>
      </div>
    `;
    wrap.querySelector('.play').addEventListener('click', ()=> speakChunked(item.text));
    wrap.querySelector('.del').addEventListener('click', ()=>{
      const after = getFavs().filter(f => f.id !== item.id);
      setFavs(after); renderFavs();
    });
    favsList.appendChild(wrap);
  });
}
