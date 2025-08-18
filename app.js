// ===== BN Frontend (stabil + Connect v1) =====
const API_BASE = ""; // samma origin
const DEFAULT_SPEED = 1.0;

// ===== UI refs =====
const els = {
  // views & nav
  nav: document.querySelectorAll("nav a[data-view]"),
  viewCreate: document.getElementById("view-create"),
  viewConnect: document.getElementById("view-connect"),
  // create
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
  // connect
  cnick: document.getElementById("cnick"),
  clevel: document.getElementById("clevel"),
  csave: document.getElementById("csave"),
  cstatus: document.getElementById("cstatus"),
  cfavs: document.getElementById("cfavs"),
};

function ui(msg, bad=false){ if(!els.status) return; els.status.textContent = msg || ""; els.status.style.color = bad ? "#f66" : "#9bd"; }
function chosenLevel(){ const b = els.levelBtns.find(x=>x.checked); return b ? Number(b.value) : 2; }

// ===== Navigation (tabs) =====
function switchView(name){
  if (name === "connect"){
    els.viewCreate.classList.add("hidden");
    els.viewConnect.classList.remove("hidden");
    document.querySelectorAll("nav a").forEach(a=>a.classList.toggle("active", a.dataset.view==="connect"));
    loadProfile();
  } else {
    els.viewConnect.classList.add("hidden");
    els.viewCreate.classList.remove("hidden");
    document.querySelectorAll("nav a").forEach(a=>a.classList.toggle("active", a.dataset.view==="create"));
  }
}

// ===== API helper (timeout + retry + no-store) =====
async function postJSON(path, payload, timeoutMs=70000){
  const attempt = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort("timeout"), timeoutMs);
    try{
      const r = await fetch(`${API_BASE}${path}?v=${Date.now()}`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
        cache: "no-store",
        credentials: "same-origin"
      });
      clearTimeout(t);
      return r;
    }catch(e){ clearTimeout(t); throw e; }
  };
  try{ return await attempt(); }
  catch(e){ await new Promise(r=>setTimeout(r,500)); return attempt(); }
}

// ===== Create flow =====
function getParams(){
  return {
    minutes: Number(els.minutes?.value || 5),
    level: chosenLevel(),
    voice: els.voice?.value || "verse",
    speed: Number(els.speed?.value || DEFAULT_SPEED),
    idea: (els.idea?.value || "").trim()
  };
}
function setStory(text){ els.story.value = text; }
function setAudioFromBlob(blob){
  const url = URL.createObjectURL(blob);
  els.player.src = url; els.player.load();
}

async function makeText(){
  const p = getParams();
  if (!p.idea){ throw new Error("Skriv din idé först."); }
  ui("Skapar text …");
  const r = await postJSON("/api/generate", { idea: p.idea, level: p.level, minutes: p.minutes }, 80000);
  if (!r.ok){ const t = await r.text().catch(()=> ""); throw new Error(`Textfel (${r.status}): ${t}`); }
  const data = await r.json();
  if (!data.ok || !data.text) throw new Error("Tomt svar från generatorn.");
  setStory(data.text);
  ui("Text klar ✓");
  return data.text;
}

async function makeVoice(text){
  const p = getParams();
  ui("Skapar röst …");
  const r = await postJSON("/api/tts", { text, voice: p.voice, speed: p.speed }, 90000);
  if (!r.ok){ const t = await r.text().catch(()=> ""); throw new Error(`TTS-fel (${r.status}): ${t}`); }
  const blob = await r.blob();
  setAudioFromBlob(blob);
  try { els.player.playbackRate = p.speed; } catch {}
  els.player.play().catch(()=>{});
  ui("Klart ✓");
}

async function handleRead(){
  try{
    els.btnGen.disabled = true;
    const text = await makeText();
    await makeVoice(text);
  }catch(e){ console.error(e); ui(e.message || "Fel uppstod", true); }
  finally{ els.btnGen.disabled = false; }
}

async function handleMakeText(){
  try{
    els.btnMakeText.disabled = true;
    await makeText();
  }catch(e){ console.error(e); ui(e.message || "Fel uppstod", true); }
  finally{ els.btnMakeText.disabled = false; }
}

function downloadTxt(){
  const text = els.story.value || "";
  if (!text) return;
  const blob = new Blob([text], { type:"text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "berattelse.txt";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ===== BlushConnect v1 (lokalt) =====
const LS_KEY_PROFILE = "bn_profile";
const LS_KEY_FAVS = "bn_favs";

function loadProfile(){
  try{
    const p = JSON.parse(localStorage.getItem(LS_KEY_PROFILE)||"{}");
    if (p.nick) els.cnick.value = p.nick;
    if (p.level) els.clevel.value = String(p.level);
    renderFavs();
  }catch{}
}
function saveProfile(){
  const prof = { nick: (els.cnick.value||"").trim(), level: Number(els.clevel.value||2) };
  localStorage.setItem(LS_KEY_PROFILE, JSON.stringify(prof));
  if (els.cstatus){ els.cstatus.textContent = "Sparat ✓"; setTimeout(()=>els.cstatus.textContent="", 1500); }
}
function renderFavs(){
  const ul = els.cfavs; if (!ul) return;
  ul.innerHTML = "";
  const favs = JSON.parse(localStorage.getItem(LS_KEY_FAVS)||"[]");
  favs.forEach((f,i)=>{
    const li = document.createElement("li");
    li.textContent = `${i+1}. ${f.title || "Story"} (${f.level||"?"})`;
    ul.appendChild(li);
  });
}

// ===== Init =====
(function init(){
  // nav
  els.nav.forEach(a=>{
    a.addEventListener("click", (e)=>{ e.preventDefault(); switchView(a.dataset.view); });
  });
  switchView("create");

  // create
  if (els.btnGen) els.btnGen.addEventListener("click", handleRead);
  if (els.btnMakeText) els.btnMakeText.addEventListener("click", handleMakeText);
  if (els.btnDownload) els.btnDownload.addEventListener("click", downloadTxt);
  if (els.speed) els.speed.value = DEFAULT_SPEED;

  // connect
  if (els.csave) els.csave.addEventListener("click", saveProfile);
})();
