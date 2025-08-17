// ===== Frontend controller for BN =====
const API = ""; // lämna tom för samma origin (/api/...)

// Elements
const els = {
  // nav + views
  navHome: document.getElementById("navHome"),
  navCreate: document.getElementById("navCreate"),
  navConnect: document.getElementById("navConnect"),
  vHome: document.getElementById("viewHome"),
  vCreate: document.getElementById("viewCreate"),
  vConnect: document.getElementById("viewConnect"),
  vFooter: document.getElementById("viewFooter"),

  // gate
  chk18: document.getElementById("chk18"),
  btnStart: document.getElementById("btnStart"),
  btnOpenConnect: document.getElementById("btnOpenConnect"),

  // status
  status: document.getElementById("status"),

  // create controls
  length:  document.getElementById("length"),
  levelRadios: () => Array.from(document.querySelectorAll('input[name="level"]')),
  voice:   document.getElementById("voice"),
  speed:   document.getElementById("speed"),
  idea:    document.getElementById("idea"),
  btnGenRead: document.getElementById("btnGenRead"),
  btnTxt:  document.getElementById("btnDownload"),
  story:   document.getElementById("story"),
  player:  document.getElementById("player")
};

// UI helpers
const uiStatus = (msg, isError = false) => {
  if (!els.status) return;
  els.status.textContent = msg || "";
  els.status.style.color = isError ? "#ff6b6b" : "#9bd67b";
};

function getLevel() {
  const checked = els.levelRadios().find(r => r.checked);
  return checked ? Number(checked.value) : 2;
}

// API helper med timeout + cache-bust
async function callApi(path, payload, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload || {}),
    signal: ctrl.signal
  }).catch(err => {
    clearTimeout(t);
    throw err;
  });

  clearTimeout(t);

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      detail = `${res.status} :: ${j.error || j.detail || JSON.stringify(j)}`;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// === Combined flow: Generate -> TTS -> Play ===
let busy = false;

async function onGenRead() {
  if (busy) return;
  const idea = (els.idea?.value || "").trim();
  if (!idea) { uiStatus("Skriv din idé först.", true); els.idea?.focus?.(); return; }

  busy = true;
  els.btnGenRead?.setAttribute("disabled", "true");
  uiStatus("Skapar text …");

  // nollställ spelare
  if (els.player) {
    els.player.removeAttribute("src");
    els.player.load?.();
  }
  if (els.story) els.story.textContent = "";

  const level = getLevel();
  const minutes = Number(els.length?.value || 5);

  try {
    // 1) Generate text
    const gen = await callApi("/api/generate", { idea, level, minutes }, 60000);
    if (!gen?.ok || !gen.text) throw new Error("tomt svar från generate");
    els.story.textContent = gen.text;

    // 2) TTS
    uiStatus("Genererar röst …");
    const voice = els.voice?.value || "alloy";
    const speed = Number(els.speed?.value || 1.0);
    const tts = await callApi("/api/tts", { text: gen.text, voice, speed }, 90000);
    if (!tts?.ok || !tts.audio) throw new Error(tts?.error || "tts-fel");

    // 3) Spela
    const b64 = tts.audio.split(",").pop();
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const blob = new Blob([buf], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    if (els.player) {
      els.player.src = url;
      try { els.player.playbackRate = speed; } catch {}
      els.player.play().catch(()=>{});
    }
    uiStatus("Klart ✔");
  } catch (err) {
    uiStatus(`Generate failed: ${err.message || err}`, true);
  } finally {
    busy = false;
    els.btnGenRead?.removeAttribute("disabled");
  }
}

// Download .txt
function onDownloadTxt() {
  const txt = (els.story?.textContent || "").trim();
  if (!txt) return;
  const file = new Blob([txt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = "berattelse.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ===== Router / Gate =====
function setActive(navId){
  [els.navHome, els.navCreate, els.navConnect].forEach(a=>a && a.classList.remove("active"));
  const el = document.getElementById(navId);
  if (el) el.classList.add("active");
}

function show(view){
  els.vHome?.classList.add("hidden");
  els.vCreate?.classList.add("hidden");
  els.vConnect?.classList.add("hidden");
  els.vFooter?.classList.add("hidden");
  view?.classList.remove("hidden");
  els.vFooter?.classList.remove("hidden");
}

function route(){
  const hash = location.hash || "#/home";
  if (hash.startsWith("#/create")){
    setActive("navCreate");
    show(els.vCreate);
  } else if (hash.startsWith("#/connect")){
    setActive("navConnect");
    show(els.vConnect);
  } else {
    setActive("navHome");
    show(els.vHome);
  }
}

// Gate: aktivera knappar när 18+ är checkad
function updateGate(){
  const ok = !!els.chk18?.checked;
  [els.btnStart, els.btnOpenConnect].forEach(b=>{
    if (!b) return;
    if (ok) b.removeAttribute("disabled");
    else b.setAttribute("disabled","true");
  });
}

window.addEventListener("hashchange", route);

window.addEventListener("DOMContentLoaded", () => {
  // Gate
  els.chk18?.addEventListener("change", updateGate);
  updateGate();

  // Gate-knappar -> rutter
  els.btnStart?.addEventListener("click", ()=> { location.hash = "#/create"; });
  els.btnOpenConnect?.addEventListener("click", ()=> { location.hash = "#/connect"; });

  // Nav-länkar
  els.navHome?.addEventListener("click", (e)=>{ e.preventDefault(); location.hash = "#/home"; });
  els.navCreate?.addEventListener("click", (e)=>{ e.preventDefault(); location.hash = "#/create"; });
  els.navConnect?.addEventListener("click", (e)=>{ e.preventDefault(); location.hash = "#/connect"; });

  // Combined generate + tts
  els.btnGenRead?.addEventListener("click", onGenRead);
  els.btnTxt?.addEventListener("click", onDownloadTxt);

  route();
});
