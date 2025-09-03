// BN web/app.js v1.5.3 (live-ready, server-driven, TTS-knapp)
const API = "https://bn-worker.bjorta-bb.workers.dev/api/v1";

// Helpers
const $ = (id) => document.getElementById(id);
const post = (p, d = {}) =>
  fetch(`${API}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })
    .then(async r => ({ ok: r.ok, status: r.status, json: await r.json() }));
const get = (p) => fetch(`${API}${p}`).then(r => r.json());
const save = (k,v)=>localStorage.setItem(k,JSON.stringify(v));
const load = (k)=>{ try{return JSON.parse(localStorage.getItem(k))}catch{return null}};

// Nivåbeskrivningar
const levelDescriptions = {
  1: "Romantisk: känslor & stämning. Inga kroppsliga detaljer, inga könsord.",
  2: "Antydande sensuell: beröring & metaforer. Inga könsord.",
  3: "Sensuell+: mild explicit. Vaga anatomiska ord, ej grova uttryck.",
  4: "Het: explicit men stilrent. Detaljer tillåtna, undviker grövsta fraser.",
  5: "Explicit: raka ord & tydliga beskrivningar (inom regler & lag)."
};

// State
let SESSION=null, CHARACTER=null, ARC=null, LEVEL=2;

// Init
(async function init(){
  $("statusText").textContent="Hämtar status…";
  try{
    const s = await get("/status");
    $("statusText").textContent = `Version: ${s.version}, mock: ${s.flags?.MOCK ? "ON" : "OFF"}`;
    $("providerPill").textContent = `worker v${s.version}${s.flags?.MOCK ? " (mock)" : ""}`;
  }catch{ $("statusText").textContent="Kunde inte läsa status"; }

  SESSION = load("bn:session") || await get("/session"); save("bn:session", SESSION);
  $("statusText").textContent += ` | user: ${SESSION.user_id.slice(0,8)}…`;

  $("charName").value = "Nadja";
  $("arcTitle").value = "Första mötet";
  setupLevels();
  renderLevel();
})();

function setupLevels(){
  $("levels").querySelectorAll(".lvl-btn").forEach(btn=>{
    const n = Number(btn.dataset.level);
    btn.dataset.active = (n===LEVEL) ? "true":"false";
    btn.onclick=()=>{ LEVEL=n; $("levels").querySelectorAll(".lvl-btn").forEach(b=>b.dataset.active="false"); btn.dataset.active="true"; renderLevel(); };
  });
}
function renderLevel(){ $("lvlDesc").textContent = `${LEVEL} – ${levelDescriptions[LEVEL]}`; }

// UI actions
$("btnCreateChar").onclick = async ()=>{
  if(!SESSION) return alert("Ingen session");
  const name = $("charName").value.trim(); if(!name) return alert("Ange namn");
  const {json} = await post("/characters/create", { user_id: SESSION.user_id, name });
  CHARACTER=json; save("bn:character", CHARACTER);
  $("charInfo").textContent = `id: ${json.character_id}`;
};

$("btnStartArc").onclick = async ()=>{
  if(!SESSION) return alert("Ingen session");
  CHARACTER = CHARACTER || load("bn:character"); if(!CHARACTER) return alert("Skapa karaktär först");
  const title = $("arcTitle").value.trim(); if(!title) return alert("Ange titel");
  const {json} = await post("/arcs/start", { user_id: SESSION.user_id, character_id: CHARACTER.character_id, title, level_min:1, level_max:5 });
  ARC=json; save("bn:arc", ARC);
  $("arcInfo").textContent = `arc_id: ${json.arc_id}`;
};

$("btnGenerate").onclick = async ()=>{
  try{
    if(!SESSION) return alert("Ingen session");
    CHARACTER = CHARACTER || load("bn:character"); if(!CHARACTER) return alert("Skapa karaktär först");
    ARC = ARC || load("bn:arc"); if(!ARC) return alert("Starta en arc först");

    $("resultCard").style.display="block";
    $("story").textContent="Skapar berättelse…";
    $("summary").textContent=""; $("memory").textContent="";

    const payload = {
      user_id: SESSION.user_id,
      character_id: CHARACTER.character_id,
      arc_id: ARC.arc_id,
      prompt: $("prompt").value,
      level: LEVEL,
      lang: $("lang").value,
      words: Number($("words").value),
      make_audio: false
    };

    const {ok,status,json} = await post("/episodes/generate", payload);
    if(!ok){
      console.error("GEN FAIL",status,json);
      $("story").textContent = json?.error ? `${json.error}: ${json.details||""}` : "Kunde inte generera (serverfel).";
      return;
    }

    $("story").textContent   = json?.story || "(ingen story mottagen)";
    $("summary").textContent = json?.summary || "";
    $("memory").textContent  = json?.memory_summary || "";

    await listEpisodes();
  }catch(e){ console.error(e); alert("Kunde inte generera"); }
};

$("btnList").onclick = listEpisodes;
async function listEpisodes(){
  if(!SESSION) return;
  CHARACTER = CHARACTER || load("bn:character"); if(!CHARACTER) return;
  const {json} = await post("/episodes/by-character", { user_id: SESSION.user_id, character_id: CHARACTER.character_id, limit:50 });
  const ul = $("list"); ul.innerHTML="";
  (json.items||[]).forEach(it=>{
    const li=document.createElement("li");
    li.innerHTML = `
      <div><b>${new Date(it.created_at||Date.now()).toLocaleString()}</b></div>
      <div class="muted">nivå ${it.level} • steg ${it.arc_step} • ${it.lang||"sv"}</div>
      <div class="mono">${(it.episode_summary||"").slice(0,220)}</div>`;
    ul.appendChild(li);
  });
}

// Inbyggd browser-TTS (provlyssning)
$("btnListen").onclick = ()=>{
  try{
    window.speechSynthesis.cancel();
    const text = $("story")?.innerText?.trim() || "";
    if(!text) return alert("Ingen text att läsa upp.");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = ($("lang").value === "en") ? "en-US" : "sv-SE";
    u.rate = 1.0; u.pitch = 1.0;
    speechSynthesis.speak(u);
  }catch(e){ console.error(e); alert("TTS stöds inte i denna webbläsare."); }
};

// Feedback → worker sparar i D1
$("btnFeedback").onclick = async ()=>{
  try{
    const topic = prompt("Ämne (valfritt):",""); if(topic===null) return;
    const message = prompt("Beskriv problemet eller skriv din fråga (krävs):",""); if(message===null) return;
    if(!message.trim()) return alert("Meddelande krävs.");
    const email = prompt("Din e-post (valfritt):","");
    const {json} = await post("/feedback/submit",{ user_id: SESSION?.user_id || null, email, topic, message });
    alert(json?.ok ? "Tack! Din feedback är mottagen." : "Kunde inte spara feedback just nu.");
  }catch(e){ console.error(e); alert("Fel när feedback skickades."); }
};
