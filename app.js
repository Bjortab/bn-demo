// app.js — BN front GC v1.5
// - Loopar /api/generate-part tills hela berättelsen är klar
// - Visar progress (DEL x/y)
// - TTS efter hela texten (server först, webbläsare fallback)

const $ = (q) => document.querySelector(q);

const $level   = $("#level");
const $length  = $("#length");
const $voice   = $("#voice");
const $tempo   = $("#tempo");
const $idea    = $("#userIdea");

const $output  = $("#output");
const $btnGen  = $("#generateBtn");
const $btnPlay = $("#listenBtn");
const $btnStop = $("#stopBtn");
const $audio   = $("#audio");

const BASE = location.origin + "/api";

let busyGen = false;
let busyTts = false;

function now(){ return new Date().toLocaleTimeString(); }
function setText(t){ $output.textContent = t || ""; }
function appendStatus(msg){
  const prev = ($output.textContent||"").trim();
  const line = `[${now()}] ${msg}`;
  $output.textContent = prev ? `${prev}\n${line}` : line;
}
function clearAudio(){
  try{ $audio.pause(); }catch{}
  try{ URL.revokeObjectURL($audio.src); }catch{}
  $audio.src = "";
}
function setBusy(gen=false, tts=false){
  busyGen = !!gen; busyTts = !!tts;
  $btnGen.disabled  = busyGen || busyTts;
  $btnPlay.disabled = busyGen || busyTts || !($output.dataset.story || "");
  $btnStop.disabled = !busyTts && !$audio.src;
}
function getLevel(){ return Math.max(1, Math.min(5, Number($level?.value || 3))); }
function getMinutes(){
  const radio = document.querySelector('input[name="length"]:checked');
  const v = radio ? radio.value : ($length?.value || 5);
  return Math.max(1, Math.min(30, Number(v||5)));
}
function getVoice(){ return ($voice?.value || "verse"); }
function getTempo(){ return Math.max(0.8, Math.min(1.25, Number($tempo?.value || 1.0))); }

async function checkHealth(){
  try{
    const r = await fetch(`${BASE}/health`, { cache: "no-store" });
    const d = await r.json().catch(()=> ({}));
    appendStatus(d?.ok ? "API: ok" : "API: fel");
  }catch{ appendStatus("API: fel"); }
}
checkHealth();

async function generate(){
  if (busyGen || busyTts) return;

  const idea = ($idea?.value || "").trim();
  const level = getLevel();
  const minutes = getMinutes();
  if (!idea){ appendStatus("Ange en idé först."); return; }

  // reset
  clearAudio();
  setText("");
  $output.dataset.story = "";
  appendStatus("Startar chunkad generering …");
  setBusy(true, false);

  // 1) ta reda på hur många delar servern vill ha (skicka totalParts=0 => server räknar)
  let totalParts = 0;
  let story = "";
  let nextTail = "";

  // Vi genererar första delen för att få totalParts (servern returnerar det)
  try {
    let res = await fetch(`${BASE}/generate-part`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea, level, minutes, partIndex: 1, totalParts: 0, prevTail: "" })
    });
    if (!res.ok){
      const txt = await res.text();
      appendStatus(`Fel vid DEL 1: ${res.status}`); console.error(txt);
      setBusy(false, false); return;
    }
    const d = await res.json();
    totalParts = Number(d?.totalParts || 1);
    story += (d?.chunk || "");
    nextTail = d?.nextTail || "";
    setText(story);
    appendStatus(`DEL 1/${totalParts} klar.`);
  } catch (e) {
    appendStatus("Nätverksfel vid DEL 1."); console.error(e);
    setBusy(false,false); return;
  }

  // 2) loopa resterande delar
  for (let part = 2; part <= totalParts; part++){
    appendStatus(`Genererar DEL ${part}/${totalParts} …`);
    try{
      const res = await fetch(`${BASE}/generate-part`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idea, level, minutes,
          partIndex: part,
          totalParts,
          prevTail: nextTail
        })
      });
      if (!res.ok){
        const txt = await res.text();
        appendStatus(`Fel vid DEL ${part}: ${res.status}`); console.error(txt);
        setBusy(false,false); return;
      }
      const d = await res.json();
      story += (story.endsWith("\n") ? "" : "\n\n") + (d?.chunk || "");
      nextTail = d?.nextTail || "";
      setText(story);
      appendStatus(`DEL ${part}/${totalParts} klar.`);
    } catch (e) {
      appendStatus(`Nätverksfel DEL ${part}.`); console.error(e);
      setBusy(false,false); return;
    }
  }

  // klar text
  $output.dataset.story = story;
  appendStatus("Hämtar röst …");
  setBusy(false, true);

  // 3) TTS (server först)
  try{
    const vr = await fetch(`${BASE}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: story,
        voice: getVoice(),
        tempo: getTempo(),
        ssml: false
      })
    });
    if (vr.ok){
      const blob = await vr.blob();
      const url  = URL.createObjectURL(blob);
      $audio.src = url;
      try { await $audio.play(); appendStatus("Spelar (server-TTS)."); }
      catch { appendStatus("Klar (server-TTS)."); }
      setBusy(false,false);
      return;
    }
    // fallback
    appendStatus("Röst: fallback (webbläsare).");
    await speakWithBrowserTTS(story, getVoice(), getTempo());
    setBusy(false,false);
  } catch (e) {
    appendStatus("TTS fel – använder webbläsare.");
    await speakWithBrowserTTS(story, getVoice(), getTempo());
    setBusy(false,false);
  }
}

async function replay(){
  if (busyGen || busyTts) return;
  const story = ($output.dataset.story || "").trim();
  if (!story) return;

  setBusy(false,true);
  if ($audio.src){
    try{ $audio.currentTime = 0; await $audio.play(); appendStatus("Spelar (server-TTS)."); }
    catch{}
    setBusy(false,false); return;
  }
  await speakWithBrowserTTS(story, getVoice(), getTempo());
  setBusy(false,false);
}

function stopAll(){
  try{ speechSynthesis.cancel(); }catch{}
  try{ $audio.pause(); }catch{}
  appendStatus("Stopp.");
  setBusy(false,false);
}

// ——— webbläsar-TTS fallback ———
async function speakWithBrowserTTS(text, voiceKey, tempo){
  return new Promise((resolve)=>{
    if (typeof window.speechSynthesis==="undefined"){
      appendStatus("Webbläsaren saknar TTS."); return resolve();
    }
    const u = new SpeechSynthesisUtterance(String(text||""));
    u.lang = "sv-SE";

    const wantFemale = (voiceKey==="verse");
    const wantMale   = (voiceKey==="coral");
    const voices = speechSynthesis.getVoices();
    let v = voices.find(v => v.lang?.toLowerCase().startsWith("sv") && (
      wantFemale ? /female|kvin|Astrid|Alva|Svenska/i.test(v.name) :
      wantMale   ? /male|man|Erik|Hugo|Svenska/i.test(v.name) : true
    )) || voices.find(v => v.lang?.toLowerCase().startsWith("sv")) || voices[0];
    if (v) u.voice = v;

    const rate = Math.max(0.9, Math.min(1.15, 0.9 + (Number(tempo||1)-1)*0.5));
    u.rate = rate; u.pitch = wantFemale ? 1.05 : wantMale ? 0.95 : 1.0;

    u.onend = ()=>{ appendStatus("Klar (webbläsare)."); resolve(); };
    u.onerror= ()=>{ appendStatus("Fel i webbläsar-röst."); resolve(); };

    try{ speechSynthesis.cancel(); }catch{}
    try{ speechSynthesis.speak(u); }catch{ resolve(); }
  });
}

// ——— bind ———
document.getElementById("generateBtn")?.addEventListener("click", generate);
document.getElementById("listenBtn")?.addEventListener("click", replay);
document.getElementById("stopBtn")?.addEventListener("click", stopAll);

appendStatus("BN front laddad (v1.5, chunkad).");
