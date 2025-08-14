/* BN – gratis TTS i browsern + backend-anrop (om aktiverat).
   Hastighetsreglaget är borttaget. Vi styr bara röst + volym. */

let currentLevel = 1;
let detail = 50;       // 0–100
let volume = 0.6;      // 0–1
let currentVoice = null;
let lastStoryText = '';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 2400);
}

// ---- Modal “Kommer snart”
const soonDlg = $('#soonModal');
$('#closeSoon')?.addEventListener('click', () => soonDlg.close());
$$('[data-soon]').forEach(el => el.addEventListener('click', () => !soonDlg.open && soonDlg.showModal()));

// ---- Nav smooth scroll
$$('.topnav .navlink').forEach((a) => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    if (href && href.startsWith('#')) {
      e.preventDefault();
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
      $$('.navlink').forEach(n => n.classList.remove('active'));
      a.classList.add('active');
    }
  });
});

// ---- Nivå
$$('.level-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.level-chip').forEach(b => {
      b.classList.toggle('selected', b === btn);
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });
    currentLevel = Number(btn.dataset.level);
    toast(`Nivå ${currentLevel} vald`);
  });
});

// ---- Reglage
const detailEl = $('#detail'); const detailOut = $('#detailOut');
detailEl.addEventListener('input', (e) => { detail = Number(e.target.value); detailOut.textContent = detail; });

const volEl = $('#volume'); const volOut = $('#volOut');
volEl.addEventListener('input', (e) => { volume = Number(e.target.value)/100; volOut.textContent = e.target.value; });

// ---- TTS (webbläsarens inbyggda)
const voiceSelect = $('#voiceSelect');
const testVoiceBtn = $('#testVoice');

function loadVoices(){
  const voices = speechSynthesis.getVoices().filter(v => v.lang?.toLowerCase().startsWith('sv') || v.lang?.toLowerCase().startsWith('en'));
  voiceSelect.innerHTML = '';
  voices.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.name; opt.textContent = `${v.name} (${v.lang})`;
    voiceSelect.appendChild(opt);
  });
  const sv = voices.find(v => v.lang?.toLowerCase().startsWith('sv'));
  currentVoice = sv || voices[0] || null;
  if (currentVoice) voiceSelect.value = currentVoice.name;
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
  const v = speechSynthesis.getVoices().find(x => x.name === voiceSelect.value);
  if (v) currentVoice = v;
});

function speak(text){
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (currentVoice) u.voice = currentVoice;
  u.lang = (currentVoice?.lang || 'sv-SE');
  u.volume = volume;
  window.speechSynthesis.speak(u);
}
testVoiceBtn.addEventListener('click', ()=>{
  speak('Detta är en förhandslyssning av vald röst i Blush Narratives.');
});

// ---- Text-ton (lokal)
function blendTone(level, detailPct) {
  const base = {
    1: ["varma blickar", "lätta beröringar", "romantisk ton"],
    3: ["pirrig nyfikenhet", "långsamma andetag", "förväntansfull stämning"],
    5: ["otålig lust", "handfasta rörelser", "nakna erkännanden"]
  }[level];
  const ix = Math.min(2, Math.floor(detailPct / 50)); // 0..2
  return [ base[0], detailPct < 50 ? base[1] : base[ix], base[ix] ];
}

function targetWordCount(mins){ return Math.round(mins * 170); }

// ---- Skapa berättelse
const ideaEl = $('#idea');
const durationEl = $('#duration');
const createBtn = $('#createBtn');
const resultEl = $('#result');
const readBtn = $('#readBtn');

function setLoading(btn, on) { btn.classList.toggle('loading', on); btn.disabled = on; }

function localDraftFromPrompt(prompt, level, detailPct, mins){
  const words = targetWordCount(mins);
  const [a,b,c] = blendTone(level, detailPct);
  const base = prompt.trim() || "En oväntad kväll";
  const p1 = `${base}. I skymningen möttes ni, där ${a} sa mer än ord.`;
  const p2 = `Rummet fylldes av ${b}, och ni vågade stanna upp, nära.`;
  const p3 = `Med ${c} närvarande tog kvällen sin riktning – detaljer växer naturligt.`;
  return `${[p1,p2,p3].join(' ')}\n\n[Demo – mållängd ≈ ${words} ord. Backend fyller ut hela texten när AI är på.]`;
}

async function handleCreate(){
  const idea = ideaEl.value.trim();
  if(!idea){ ideaEl.focus(); toast('Skriv en idé först.'); return; }
  setLoading(createBtn, true);
  resultEl.hidden = false;
  resultEl.textContent = 'Skapar berättelse...';

  const mins = Number(durationEl.value || '5');

  // Försök backend (om aktiv). Om det faller – visa lokal draft.
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: idea, level: currentLevel, detail, minutes: mins })
    });
    if (!res.ok) throw new Error('Backend svarade inte OK');
    const data = await res.json();
    if (!data?.text) throw new Error('Saknar text i backend-svar');
    lastStoryText = data.text;
    resultEl.textContent = data.text;
  } catch (e) {
    const local = localDraftFromPrompt(idea, currentLevel, detail, mins);
    lastStoryText = local;
    resultEl.textContent = local;
  }

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

// Läs upp
readBtn.addEventListener('click', ()=> {
  if (!lastStoryText) { toast('Skapa en berättelse först.'); return; }
  speak(lastStoryText);
});
