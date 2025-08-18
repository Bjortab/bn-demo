// ===== KONFIG =====
const API_BASE = ""; // tom = samma domän (Cloudflare Pages)
const DEFAULT_SPEED = 1.0;

// ===== UI-refs =====
const els = {
  minutes: document.getElementById("length"),
  levelBtns: Array.from(document.querySelectorAll('input[name="spice"]')),
  voice: document.getElementById("voice"),
  speed: document.getElementById("speed"),
  idea: document.getElementById("idea"),
  btnGen: document.getElementById("btnRead"),
  btnMakeText: document.getElementById("btnMakeText"),
  btnDownload: document.getElementById("btnDownload"),
  player: document.getElementById("player"),
  story: document.getElementById("story"),
  status: document.getElementById("status"),
};

// Hjälp
function ui(msg, bad=false){ els.status.textContent = msg || ""; els.status.style.color = bad ? "#f66" : "#9bd"; }
function chosenLevel(){
  const b = els.levelBtns.find(x=>x.checked);
  return b ? Number(b.value) : 2;
}
function getParams(){
  return {
    minutes: Number(els.minutes?.value || 5),
    level: chosenLevel(),
    voice: els.voice?.value || "alloy",
    speed: Number(els.speed?.value || DEFAULT_SPEED),
    idea: (els.idea?.value || "").trim()
  };
}
function setStory(text){ els.story.value = text; }
function setAudio(blob){
  const url = URL.createObjectURL(blob);
  els.player.src = url;
  els.player.load();
}

// API helpers med lång timeout
async function postJSON(path, payload){
  const ctrl = new AbortController();
  const to = setTimeout(()=>ctrl.abort("timeout"), 60000);
  try{
    const r = await fetch(`${API_BASE}${path}`, {
      method:"POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    clearTimeout(to);
    return r;
  }catch(e){
    clearTimeout(to);
    throw e;
  }
}

// Generera TEXT
async function makeText(){
  const p = getParams();
  ui("Skapar text …");
  const r = await postJSON("/api/generate", { idea: p.idea, level: p.level, minutes: p.minutes });
  if(!r.ok){
    const t = await r.text().catch(()=> "");
    throw new Error(`Textfel (${r.status}): ${t}`);
  }
  const data = await r.json();
  if(!data.ok || !data.text) throw new Error("Tomt svar från generatorn.");
  setStory(data.text);
  ui("Text klar ✓");
  return data.text;
}

// Generera RÖST (OpenAI TTS)
async function makeVoice(text){
  const p = getParams();
  ui("Skapar röst …");
  const r = await postJSON("/api/tts", { text, voice: p.voice || "alloy", speed: p.speed || DEFAULT_SPEED });
  if(!r.ok){
    const t = await r.text().catch(()=> "");
    throw new Error(`TTS-fel (${r.status}): ${t}`);
  }
  const blob = await r.blob();
  setAudio(blob);
  ui("Klart ✓");
}

// EN-KNAPP: Text -> Röst
async function handleRead(){
  try{
    els.btnGen.disabled = true;
    const text = await makeText();
    await makeVoice(text);
  }catch(e){
    console.error(e);
    ui(e.message || "Ett fel inträffade", true);
  }finally{
    els.btnGen.disabled = false;
  }
}

// Separat “Skapa text” om du vill prova bara texten
async function handleMakeText(){
  try{
    els.btnMakeText.disabled = true;
    await makeText();
  }catch(e){
    console.error(e);
    ui(e.message || "Ett fel inträffade", true);
  }finally{
    els.btnMakeText.disabled = false;
  }
}

// Ladda ner .txt
function downloadTxt(){
  const text = els.story.value || "";
  const blob = new Blob([text], { type:"text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "berattelse.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Init
(function(){
  if (els.btnGen) els.btnGen.addEventListener("click", handleRead);
  if (els.btnMakeText) els.btnMakeText.addEventListener("click", handleMakeText);
  if (els.btnDownload) els.btnDownload.addEventListener("click", downloadTxt);
  if (els.speed) els.speed.value = DEFAULT_SPEED;
  // Gör prompt-rutan stor även på mobil
  if (els.idea) { els.idea.rows = 5; }
})();
