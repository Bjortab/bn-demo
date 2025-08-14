/* BN – fokus: mänskligt ljud (gratis TTS i browsern) + “sanningsenlig” prompt → text
   Nu: allting funkar lokalt, utan nycklar. Backend-stub kommer separat. */

let currentLevel = 1;
let detail = 50;       // 0–100
let rate = 1.00;       // 0.8–1.3
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

const rateEl = $('#rate'); const rateOut = $('#rateOut');
rateEl.addEventListener('input', (e) => { rate = Number(e.target.value); rateOut.textContent = rate.toFixed(2); });

const volEl = $('#volume'); const volOut = $('#volOut');
volEl.addEventListener('input', (e) => { volume = Number(e.target.value)/100; volOut.textContent = e.target.value; });

// ---- TTS (webbläsarens inbyggda) – gratis, varierar i kvalitet mellan enheter
const voiceSelect = $('#voiceSelect');
const testVoiceBtn = $('#testVoice');

function loadVoices(){
  const voices = speechSynthesis.getVoices().filter(v => v.lang?.toLowerCase().startsWith('sv') || v.lang?.toLowerCase().startsWith('en'));
  voiceSelect.innerHTML = '';
  voices.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = v.name; opt.textContent = `${v.name} (${v.lang})`;
    voiceSelect.appendChild(opt);
  });
  // välj gärna en svensk röst om den finns
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
  u.rate = rate;
  u.volume = volume;
  window.speechSynthesis.speak(u);
}
testVoiceBtn.addEventListener('click', ()=>{
  speak('Detta är en förhandslyssning av vald röst i Blush Narratives.');
});

// ---- Textgenerator (lokal) – anpassar ton efter nivå + detalj
function blendTone(level, detailPct) {
  const base = {
    1: ["varma blickar", "lätta beröringar", "romantisk ton"],
    3: ["pirrig nyfikenhet", "långsamma andetag", "förväntansfull stämning"],
    5: ["otålig lust", "handfasta rörelser", "nakna erkännanden"]
  }[level];
  const ix = Math.min(2, Math.floor(detailPct / 50)); // 0..2
  return [ base[0], detailPct < 50 ? base[1] : base[ix], base[ix] ];
}

function targetWordCount(mins){
  // ca 170 ord/min med TTS
  return Math.round(mins * 170);
}

function localDraftFromPrompt(prompt, level, detailPct, mins){
  const words = targetWordCount(mins);
  const [a,b,c] = blendTone(level, detailPct);
  // Lokal, ofarlig demo: 3 stycken och “fortsätt…”-markör (riktig AI kommer från backend)
  const p1 = `${prompt.trim()} I skymningen möttes ni, där ${a} sa mer än ord.`;
  const p2 = `Rummet fylldes av ${b}, och ni vågade stanna upp, nära, låta tempot sjunka ned i något eget.`;
  const p3 = `Med ${c} närvarande tog kvällen sin riktning – detaljer låter vi växa naturligt, i det tempo ni väljer.`;
  const draft = [p1,p2,p3].join(' ');
  return `${draft}\n\n[Demo – mållängd ≈ ${words} ord. Backend fyller ut hela texten när vi kopplar på AI.]`;
}

// ---- Skapa berättelse
const ideaEl = $('#idea');
const durationEl = $('#duration');
const createBtn = $('#createBtn');
const resultEl = $('#result');
const readBtn = $('#readBtn');

function setLoading(btn, on) { btn.classList.toggle('loading', on); btn.disabled = on; }

async function handleCreate(){
  const idea = ideaEl.value.trim();
  if(!idea){ ideaEl.focus(); toast('Skriv en idé först.'); return; }
  setLoading(createBtn, true);
  resultEl.hidden = false;
  resultEl.textContent = 'Skapar berättelse...';

  // STEG A: lokal draft (omedelbar feedback)
  const mins = Number(durationEl.value || '5');
  const local = localDraftFromPrompt(idea, currentLevel, detail, mins);
  lastStoryText = local;
  resultEl.textContent = local;

  // STEG B: (valfritt) backend – när vi kopplar på AI:
  // try {
  //   const res = await fetch('/api/generate', {
  //     method: 'POST',
  //     headers: { 'content-type': 'application/json' },
  //     body: JSON.stringify({ prompt: idea, level: currentLevel, detail, minutes: mins })
  //   });
  //   const data = await res.json();
  //   lastStoryText = data.text;
  //   resultEl.textContent = data.text;
  // } catch(e) {
  //   console.warn('Backend fel, visar lokal draft istället', e);
  // }

  readBtn.disabled = false;
  setLoading(createBtn, false);
  toast('Berättelse klar (demo).');
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
