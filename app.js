/* -----------------------------------------------------------
   BN v0.4 (torrkörd)
   - Offline TTS fallback (Web Speech)
   - OpenAI TTS om API-nyckel finns (via config.js eller Rescue)
   - Inbyggt lexikon + stöd för override via window.BN_LEXICON
----------------------------------------------------------- */

const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const state = {
  level: 1,
  minutes: 3,
  tempo: 1.0,
  voice: 'auto',
  text: ''
};

// --- Lexikon (inbyggt). Kan överskridas via window.BN_LEXICON ---
const DEFAULT_LEXICON = {
  L4_SOFT: [
    "våt av förväntan","värmen spred sig","andades tungt","gav efter",
    "kunde inte hålla tillbaka","han trängde in","rytmisk takt",
    "kroppar som möts","de kom tillsammans","hans händer överallt",
    "stön fyllde rummet","kysste hennes hals","släppte kontrollen"
  ],
  L5_STRONG: [
    "han knullade henne djupt","hon red honom hårt","han kom i hennes mun",
    "hon sög i sig varenda droppe","hon kände kuken fylla henne",
    "hon gapade när han sprutade","han tog henne bakifrån",
    "hon särade på benen och tog emot","hans sperma rann längs låren",
    "hon skrek av njutning när han tryckte in den igen"
  ],
  BLOCKED: [
    "minderårig","övergrepp","icke-samtycke","droger"
  ],
  OPENERS: [
    "Mjuk musik och dämpat ljus. {namn} möter {andra} med ett leende.",
    "{namn} väntade tills {andra} kom nära nog för att känna andedräkten.",
    "Deras blickar fastnade, och luften blev tung av förväntan."
  ]
};

// --- Utilities ---
const saveLocal = (k,v) => localStorage.setItem(k, v);
const readLocal = (k, d=null) => localStorage.getItem(k) ?? d;
const delLocal = (k) => localStorage.removeItem(k);

// --- UI kopplingar ---
function bindUI(){
  // nivå
  $("#levels").addEventListener("click", e=>{
    if(e.target.matches(".pill")){
      $$("#levels .pill").forEach(p=>p.classList.remove("active"));
      e.target.classList.add("active");
      state.level = Number(e.target.dataset.level);
    }
  });

  // längd
  $("#lengths").addEventListener("click", e=>{
    if(e.target.matches(".pill")){
      $$("#lengths .pill").forEach(p=>p.classList.remove("active"));
      e.target.classList.add("active");
      state.minutes = Number(e.target.dataset.min);
    }
  });

  // röst
  $("#voice").addEventListener("change", e=> state.voice = e.target.value);

  // tempo
  const tempo = $("#tempo"), tv=$("#tempoVal");
  tempo.addEventListener("input", ()=>{
    state.tempo = Number(tempo.value);
    tv.textContent = `${state.tempo.toFixed(2)}×`;
  });

  // actions
  $("#btnGenerate").addEventListener("click", onGenerate);
  $("#btnPlay").addEventListener("click", ()=> speakText($("#output").textContent.trim() || state.text));
  $("#btnStop").addEventListener("click", stopAudio);

  // rescue / nyckel
  $("#btnRescue").addEventListener("click", openRescue);
  $("#btnApiKey").addEventListener("click", openRescue);
  $("#closeRescue").addEventListener("click", ()=> $("#rescue").close());
  $("#saveApiKey").addEventListener("click", ()=>{
    const v = $("#apiKeyInput").value.trim();
    if(v.startsWith("sk-")){ saveLocal("OPENAI_API_KEY", v); logDbg("Nyckel sparad."); }
    else logDbg("Ogiltig nyckel.");
  });
  $("#btnClearKey").addEventListener("click", ()=>{
    delLocal("OPENAI_API_KEY");
    logDbg("Nyckel rensad.");
  });
  $("#btnTestTTS").addEventListener("click", ()=>{
    speakText("Detta är ett test av rösten. Hej från Blush Narratives.");
  });

  // init rescued nyckel i fält
  const key = window.OPENAI_API_KEY || readLocal("OPENAI_API_KEY","");
  $("#apiKeyInput").value = key;
}

function openRescue(){
  $("#rescue").showModal();
  const key = window.OPENAI_API_KEY || readLocal("OPENAI_API_KEY","");
  $("#apiKeyInput").value = key;
}

// --- Textgenerator (enkel men renledd, undviker blockerade ord) ---
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function buildStory(idea, minutes, level){
  const LEX = window.BN_LEXICON || DEFAULT_LEXICON;
  const blocked = new RegExp(LEX.BLOCKED.join("|"), "i");

  const baseSentences = Math.max(6, Math.round(minutes * 10)); // ca
  const soft = LEX.L4_SOFT;
  const hard = LEX.L5_STRONG;

  const names = [["Lisa","Johan"],["Maja","Alex"],["Ida","Erik"]][Math.floor(Math.random()*3)];
  const opener = pick(LEX.OPENERS).replace("{namn}", names[0]).replace("{andra}", names[1]);

  const pool = level >=5 ? soft.concat(hard) : soft;
  const body = [];
  for(let i=0;i<baseSentences;i++){
    let s = pick(pool);
    // enkel “flowifier”
    if(level>=5){
      s = s.replace("han","han").replace("hon","hon").replace("kuken","kuken");
    }
    if(!blocked.test(s)) body.push( s.charAt(0).toUpperCase()+s.slice(1)+".");
  }

  // blanda in idén
  if(idea){
    body.splice(1,0, `Idén: ${idea.trim()}.`);
  }

  const txt = [opener, "", ...body].join(" ");
  state.text = txt;
  return txt;
}

// --- Generera-knappen ---
async function onGenerate(){
  const idea = $("#userIdea").value;
  const txt = buildStory(idea, state.minutes, state.level);
  $("#output").textContent = txt;

  // Auto-spela om vi redan tryckt Lyssna tidigare? Kör manuellt:
  // speakText(txt);
}

// --- Ljud ---
// Globalt audioobjekt för OpenAI TTS
let audioEl = new Audio();

function stopAudio(){
  try {
    window.speechSynthesis?.cancel();
    audioEl.pause();
    audioEl.currentTime = 0;
  } catch{}
}

async function speakText(text){
  stopAudio();
  const key = window.OPENAI_API_KEY || readLocal("OPENAI_API_KEY", "");

  if(key && text){
    try{
      await speakWithOpenAI(key, text, state.voice==='auto'?'alloy':state.voice, state.tempo);
      return;
    }catch(err){
      logDbg("OpenAI TTS misslyckades → fallback. " + err.message);
    }
  }
  speakWithWebSpeech(text, state.tempo);
}

function speakWithWebSpeech(text, rate=1){
  if(!("speechSynthesis" in window)) return alert("Webbläsaren saknar talstöd.");
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "sv-SE";
  u.rate = Math.max(.6, Math.min(1.6, rate));
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

// OpenAI TTS → spelar upp via <audio>
async function speakWithOpenAI(apiKey, text, voice='alloy', rate=1){
  const base = "https://api.openai.com/v1/audio/speech";
  const body = {
    model: "gpt-4o-mini-tts",
    input: text,
    voice,
    format: "mp3",
    speed: rate
  };

  const res = await fetch(base, {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const err = await res.text();
    throw new Error(`API fel: ${res.status} ${err}`);
  }
  const blob = await res.blob();
  audioEl.src = URL.createObjectURL(blob);
  await audioEl.play();
}

// --- debug helpers ---
function logDbg(msg){
  const el = $("#dbg");
  if(!el) return;
  el.textContent += (msg+"\n");
}

// --- init ---
window.addEventListener("DOMContentLoaded", ()=>{
  // init lexikon override om du vill framtidssäkra:
  // window.BN_LEXICON = window.BN_LEXICON || DEFAULT_LEXICON;
  bindUI();
});
