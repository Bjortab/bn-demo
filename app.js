// ====== Config ======
const API_BASE = "";                 // relativt /api på Cloudflare Pages
const GENERATE_TIMEOUT_MS = 60000;
const TTS_TIMEOUT_MS = 60000;
const DEFAULT_VOICE = "alloy";
const TTS_SPEED = 1.0;

// ====== DOM (Skapa) ======
const els = {
  length: document.getElementById("length"),
  spiceRadios: Array.from(document.querySelectorAll('input[name="spice"]')),
  voice: document.getElementById("voice"),
  rate: document.getElementById("rate"),
  idea: document.getElementById("idea"),
  btnPreview: document.getElementById("btnPreview"),
  btnRead: document.getElementById("btnRead"),
  btnDownload: document.getElementById("btnDownload"),
  status: document.getElementById("status"),
  excerpt: document.getElementById("excerpt"),
  player: document.getElementById("player"),
  spiceHint: document.getElementById("spiceHint"),
};

// ====== DOM (Tabs & Connect) ======
const tabBtns = Array.from(document.querySelectorAll(".tab-btn"));
const tabs = {
  create: document.getElementById("tab-create"),
  connect: document.getElementById("tab-connect"),
};
const subBtns = Array.from(document.querySelectorAll(".subnav .chip"));
const subTabs = {
  profile: document.getElementById("sub-profile"),
  explore: document.getElementById("sub-explore"),
  settings: document.getElementById("sub-settings"),
};

// Connect elements
const bc = {
  name: document.getElementById("bc-name"),
  age: document.getElementById("bc-age"),
  gender: document.getElementById("bc-gender"),
  orientation: document.getElementById("bc-orientation"),
  level: document.getElementById("bc-level"),
  visible: document.getElementById("bc-visible"),
  bio: document.getElementById("bc-bio"),
  save: document.getElementById("bc-save"),
  preview: document.getElementById("bc-preview"),
  status: document.getElementById("bc-status"),
  card: document.getElementById("bc-card"),
  list: document.getElementById("bc-list"),
  filters: Array.from(document.querySelectorAll(".ex-filter"))
};

// ====== Helpers ======
function uiStatus(msg, isError=false){
  if(!els.status) return;
  els.status.textContent = msg || "";
  els.status.style.color = isError ? "#ff7070" : "#98c67b";
}
function getLevel(){
  const r = els.spiceRadios.find(x => x.checked);
  return r ? Number(r.value) : 1;
}
function updateSpiceHint(){
  const lvl = getLevel();
  const map = {
    1:"Nivå 1 – romantiskt och antydande.",
    2:"Nivå 2 – mild med varm stämning.",
    3:"Nivå 3 – tydligt sensuellt, utan råa ord.",
    4:"Nivå 4 – hett och explicit (vuxet språk).",
    5:"Nivå 5 – maximalt hett (vuxet språk, ej våld/icke-samtycke)."
  };
  if(els.spiceHint) els.spiceHint.textContent = map[lvl] || "";
}
els.spiceRadios.forEach(r => r.addEventListener('change', updateSpiceHint));
updateSpiceHint();

async function fetchWithTimeout(url, opts={}, timeoutMs=30000){
  const ctl = new AbortController();
  const id = setTimeout(()=>ctl.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  finally { clearTimeout(id); }
}

// ====== SKAPA – flöden ======
async function doGenerate(){
  const idea = (els.idea?.value || "").trim();
  if(!idea){ uiStatus("Skriv in en idé först.", true); return { ok:false }; }

  const minutes = Number(els.length?.value || 5);
  const level = getLevel();

  uiStatus("Genererar text …");
  const res = await fetchWithTimeout(`${API_BASE}/api/generate`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ idea, minutes, level })
  }, GENERATE_TIMEOUT_MS).catch(()=>null);

  if(!res || !res.ok){
    const detail = res ? await res.text().catch(()=> "") : "no_response";
    uiStatus(`Generate failed: ${res?.status || ""} :: ${detail.slice(0,120)}`, true);
    return { ok:false };
  }
  const data = await res.json().catch(()=> ({}));
  const text = data?.text?.trim() || "";
  if(!text){ uiStatus("Tomt svar från modellen.", true); return { ok:false }; }

  if(els.excerpt) els.excerpt.textContent = text;
  uiStatus("Text klar.");
  return { ok:true, text };
}

async function doTTS(text, voice){
  uiStatus("Skapar röst …");
  const speed = Number(els.rate?.value || TTS_SPEED) || 1.0;
  const res = await fetchWithTimeout(`${API_BASE}/api/tts`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ text, voice, speed })
  }, TTS_TIMEOUT_MS).catch(()=>null);

  if(!res || !res.ok){
    const detail = res ? await res.text().catch(()=> "") : "no_response";
    uiStatus(`TTS failed: ${res?.status || ""} :: ${detail.slice(0,120)}`, true);
    return { ok:false };
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if(els.player){
    els.player.src = url;
    els.player.controls = true;
    els.player.playbackRate = 1.0;  // tvinga normal hastighet
    try { await els.player.play(); } catch (_) {}
  }
  uiStatus("Klar.");
  return { ok:true };
}

// Knappar (Skapa)
els.btnPreview?.addEventListener("click", async ()=>{ await doGenerate(); });
els.btnRead?.addEventListener("click", async ()=>{
  const g = await doGenerate();
  if(!g.ok) return;
  await doTTS(g.text, (els.voice?.value || DEFAULT_VOICE));
});
els.btnDownload?.addEventListener("click", async ()=>{
  const g = await doGenerate();
  if(!g.ok) return;
  const blob = new Blob([g.text], { type:"text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "berattelse.txt";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

// ====== BLUSHCONNECT – SPA navigation ======
tabBtns.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    tabBtns.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.tab;
    Object.values(tabs).forEach(el=>el.classList.remove('active'));
    tabs[target]?.classList.add('active');
  });
});

subBtns.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    subBtns.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.sub;
    Object.values(subTabs).forEach(el=>el.classList.remove('active'));
    subTabs[target]?.classList.add('active');
  });
});

// ====== BLUSHCONNECT – Profil lagring/render ======
const LS_KEY = "bn_profile_v1";

function loadProfile(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return {};
    return JSON.parse(raw);
  }catch{ return {}; }
}
function saveProfile(p){
  localStorage.setItem(LS_KEY, JSON.stringify(p));
}

function fillProfileForm(p){
  bc.name.value = p.name || "";
  bc.age.value = p.age || "";
  bc.gender.value = p.gender || "";
  bc.orientation.value = p.orientation || "";
  bc.level.value = String(p.level || 2);
  bc.visible.value = p.visible || "public";
  bc.bio.value = p.bio || "";
}
function readProfileForm(){
  const age = Number(bc.age.value || 0);
  return {
    name: (bc.name.value || "").trim(),
    age: isFinite(age) ? age : "",
    gender: bc.gender.value || "",
    orientation: bc.orientation.value || "",
    level: Number(bc.level.value || 2),
    visible: bc.visible.value || "public",
    bio: (bc.bio.value || "").trim()
  };
}
function renderProfileCard(p){
  const safe = {
    name: p.name || "Anonym",
    age: p.age ? `${p.age}` : "18+",
    gender: p.gender || "—",
    orientation: p.orientation || "—",
    level: p.level || 2,
    bio: p.bio || "—"
  };
  bc.card.innerHTML = `
    <h3>${escapeHtml(safe.name)} <span class="badge">Nivå ${safe.level}</span></h3>
    <div class="line">Ålder: ${escapeHtml(safe.age)}</div>
    <div class="line">Kön: ${escapeHtml(safe.gender)}</div>
    <div class="line">Läggning: ${escapeHtml(safe.orientation)}</div>
    <div class="line">Synlighet: ${escapeHtml(p.visible || "public")}</div>
    <div class="line" style="margin-top:8px">${escapeHtml(safe.bio)}</div>
  `;
  bc.card.hidden = false;
}
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// init form
fillProfileForm(loadProfile());

// Save / Preview
bc.save?.addEventListener('click', ()=>{
  const p = readProfileForm();
  if(!p.name){ bc.status.textContent = "Ange visningsnamn."; bc.status.style.color="#ff7070"; return; }
  if(!p.age || p.age < 18){ bc.status.textContent = "Du måste vara 18+."; bc.status.style.color="#ff7070"; return; }
  saveProfile(p);
  bc.status.textContent = "Sparat."; bc.status.style.color="#98c67b";
  renderProfileCard(p);
});
bc.preview?.addEventListener('click', ()=>{
  renderProfileCard(readProfileForm());
});

// ====== BLUSHCONNECT – Utforska (demodata + filter) ======
const DEMO_USERS = [
  { name:"Sara", age:27, gender:"Kvinna", orientation:"Hetero", level:2, bio:"Tycker om varma röster och nivå 2–3." },
  { name:"Maja", age:33, gender:"Kvinna", orientation:"Bi", level:5, bio:"Gillar tempo och tydliga scener. Hör av dig!" },
  { name:"Anton", age:29, gender:"Man", orientation:"Hetero", level:4, bio:"Rytm, kyssar och tydliga händer." },
  { name:"Leo", age:24, gender:"Man", orientation:"Bi", level:3, bio:"Dialog och långsamt uppbyggd spänning." },
  { name:"Nora", age:31, gender:"Kvinna", orientation:"Homo", level:5, bio:"Maxnivå. Gillar tydliga önskemål." },
  { name:"Elli", age:35, gender:"Icke-binär", orientation:"Queer", level:1, bio:"Oskyldigt med antydningar. Låt det ta tid." },
];

function renderExplore(){
  const chosen = new Set(bc.filters.filter(f=>f.checked).map(f=> Number(f.value)));
  const my = loadProfile();
  const merged = [...DEMO_USERS];

  // visa också din egen profil om den är public (som demo)
  if(my?.name && my.visible !== "private"){
    merged.unshift({
      name: my.name + " (du)",
      age: my.age || 18,
      gender: my.gender || "—",
      orientation: my.orientation || "—",
      level: my.level || 2,
      bio: my.bio || ""
    });
  }

  const filtered = merged.filter(u => chosen.has(Number(u.level)));
  bc.list.innerHTML = filtered.map(u => `
    <div class="cardlet">
      <h4>${escapeHtml(u.name)} <span class="badge">Nivå ${u.level}</span></h4>
      <div class="line">Ålder: ${escapeHtml(u.age)}</div>
      <div class="line">Kön: ${escapeHtml(u.gender)}</div>
      <div class="line">Läggning: ${escapeHtml(u.orientation)}</div>
      <p style="margin:8px 0 0">${escapeHtml(u.bio)}</p>
      <div class="btn-row" style="margin-top:8px">
        <button class="secondary" disabled>Matcha (kommer)</button>
        <button class="secondary" disabled>Meddelande (kommer)</button>
      </div>
    </div>
  `).join("");
}
bc.filters.forEach(f => f.addEventListener('change', renderExplore));
renderExplore();
