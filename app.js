// === Router/18+ gate ===========================================
const elGate    = document.getElementById("gate");
const elCreate  = document.getElementById("create");
const chkAdult  = document.getElementById("adult");
const btnEnter  = document.getElementById("btnEnter");

const NAV_HOME   = document.getElementById("navHome");
const NAV_CREATE = document.getElementById("navCreate");
const NAV_CONN   = document.getElementById("navConnect");
const BTN_CONN   = document.getElementById("openConnect");

function showGate(){ elGate.classList.remove("hidden"); elCreate.classList.add("hidden"); }
function showCreate(){ elGate.classList.add("hidden"); elCreate.classList.remove("hidden"); }

function initGate(){
  const ok = localStorage.getItem("bn_adult_ok") === "1";
  if (ok) showCreate(); else showGate();

  chkAdult.addEventListener("change", () => {
    btnEnter.disabled = !chkAdult.checked;
  });

  btnEnter.addEventListener("click", (e) => {
    e.preventDefault();
    if (!chkAdult.checked) return;
    localStorage.setItem("bn_adult_ok", "1");
    showCreate();
    // valfritt: scrolla ner till idén
    const idea = document.getElementById("idea");
    if (idea) idea.focus();
  });

  NAV_HOME?.addEventListener("click", (e)=>{ e.preventDefault(); showGate(); });
  NAV_CREATE?.addEventListener("click", (e)=>{ e.preventDefault(); showCreate(); });
  NAV_CONN?.addEventListener("click", (e)=>{ e.preventDefault(); window.open("#connect","_self"); });
  BTN_CONN?.addEventListener("click", (e)=>{ e.preventDefault(); window.open("#connect","_self"); });
}
initGate();

// === API-bas (samma domän = Pages Functions) ===================
const API_BASE = ""; // låt allt gå mot /api/...

// === UI-element ================================================
const els = {
  length:  byId("length"),
  spice:   byId("spice"),
  voice:   byId("voice"),
  idea:    byId("idea"),
  btnPrev: byId("btnPreview"),
  btnRead: byId("btnRead"),
  btnDl:   byId("btnDownload"),
  status:  byId("status"),
  excerpt: byId("excerpt"),
  player:  byId("player"),
};

function byId(id){ return document.getElementById(id); }
function calcWords(mins){ return Math.round((Number(mins)||5) * 170); }

function updateWords(){
  const mins = Number(els.length.value)||5;
  const p = document.querySelector("[data-words]");
  if (p) p.textContent = `≈ 170 ord/min → ca ${calcWords(mins)} ord per ${mins} min.`;
}
updateWords();
["change","input"].forEach(ev => els.length.addEventListener(ev, updateWords));

function uiStatus(msg, isErr=false){
  els.status.textContent = msg || "";
  els.status.style.color = isErr ? "#ff7070" : "#9cdd7b";
}
function lockUI(lock=true){
  els.btnPrev.disabled = lock;
  els.btnRead.disabled = lock;
  els.btnDl.disabled   = lock;
}

// === Generella fetch-anrop med timeout =========================
async function callApi(path, payload, timeoutMs=60000) {
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(()=> "");
      throw new Error(`${res.status} :: ${txt || "Request failed"}`);
    }
    const ct = res.headers.get("Content-Type") || "";
    if (ct.includes("application/json")) return await res.json();
    if (ct.startsWith("audio/"))          return await res.blob();
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// === Händelser =================================================
els.btnPrev.addEventListener("click", async () => {
  const idea = (els.idea.value || "").trim();
  if (!idea) { uiStatus("Skriv din idé först.", true); return; }

  lockUI(true); uiStatus("Skapar text…");
  els.excerpt.textContent = "";
  try {
    const data = await callApi("generate", {
      idea,
      minutes: Number(els.length.value)||5,
      level:   Number(els.spice.value)||2,
    }, 60000);

    if (!data?.text) throw new Error("Tomt textsvar.");
    els.excerpt.textContent = data.excerpt || data.text.split("\n\n")[0];
    uiStatus("Text klar.");
  } catch (e) {
    uiStatus(`Generate failed: ${e.message}`, true);
  } finally {
    lockUI(false);
  }
});

els.btnRead.addEventListener("click", async () => {
  const idea = (els.idea.value || "").trim();
  if (!idea) { uiStatus("Skriv din idé först.", true); return; }

  lockUI(true); uiStatus("Skapar text och ljud…");
  els.excerpt.textContent = "";

  try {
    // 1) text
    const gen = await callApi("generate", {
      idea,
      minutes: Number(els.length.value)||5,
      level:   Number(els.spice.value)||2,
    }, 60000);

    const fullText = (gen?.text||"").trim();
    if (!fullText) throw new Error("Textgenereringen gav tomt svar.");
    els.excerpt.textContent = gen.excerpt || fullText.split("\n\n")[0];

    // 2) tts
    const audioBlob = await callApi("tts", {
      text: fullText,
      voice: els.voice.value || "alloy",
    }, 60000);

    const url = URL.createObjectURL(audioBlob);
    els.player.src = url;
    els.player.play().catch(()=>{});
    uiStatus("Uppläsning klar.");
  } catch (e) {
    uiStatus(`Generate failed: ${e.message}`, true);
  } finally {
    lockUI(false);
  }
});

els.btnDl.addEventListener("click", async () => {
  const idea = (els.idea.value || "").trim();
  if (!idea) { uiStatus("Skriv din idé först.", true); return; }

  lockUI(true); uiStatus("Skapar text…");
  try {
    const data = await callApi("generate", {
      idea,
      minutes: Number(els.length.value)||5,
      level:   Number(els.spice.value)||2,
    }, 60000);

    const txt = data?.text?.trim() || "";
    if (!txt) throw new Error("Tomt textsvar.");

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "berattelse.txt"; a.click();
    URL.revokeObjectURL(url);
    uiStatus("Text nedladdad.");
  } catch (e) {
    uiStatus(`Download failed: ${e.message}`, true);
  } finally {
    lockUI(false);
  }
});
