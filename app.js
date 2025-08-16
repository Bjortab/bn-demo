<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Blush Narratives</title>
  <link rel="stylesheet" href="styles.css" />
  <style>
    .container{max-width:980px;margin:24px auto;padding:0 16px}
    .card{background:#1e1f25;border:1px solid #2a2c36;border-radius:12px;padding:18px;margin-bottom:18px;color:#e6e6ea}
    body{background:#0f1115;color:#e6e6ea;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial}
    label{display:block;margin:6px 0 4px}
    select,textarea,input[type="text"],input[type="range"]{width:100%;background:#12131a;color:#e6e6ea;border:1px solid #2a2c36;border-radius:8px;padding:10px}
    textarea{min-height:110px}
    .row{display:flex;gap:12px;flex-wrap:wrap}
    .col{flex:1 1 280px}
    .btn{border:0;border-radius:10px;padding:10px 14px;cursor:pointer}
    .btn-primary{background:linear-gradient(90deg,#ff3cac,#784ba0,#2b86c5);color:white}
    .btn-ghost{background:#191b22;color:#e6e6ea;border:1px solid #2a2c36}
    .muted{opacity:.8;font-size:.95rem}
    .hidden{display:none!important}
    nav{display:flex;gap:18px;align-items:center;padding:14px 0}
    nav a{color:#e6e6ea;text-decoration:none}
    nav .brand{color:#ff5ea8;font-weight:700}
    .actions{display:flex;gap:10px;flex-wrap:wrap}
    #status{min-height:20px;margin-top:8px}
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <div class="brand">Blush <span style="color:#ff2f83">Narratives</span></div>
      <div style="margin-left:auto;display:flex;gap:16px">
        <a href="#" id="navHome">Hem</a>
        <a href="#" id="navCreate">Skapa</a>
        <a href="#" id="navConnect">BlushConnect</a>
      </div>
    </nav>

    <!-- 18+-GRIND -->
    <section id="gate" class="card">
      <h2>Välkommen</h2>
      <p class="muted">Sensuella ljudnoveller för mobilen. Välj nivå, lyssna direkt, spara favoriter.</p>

      <label style="display:flex;align-items:center;gap:10px;margin:10px 0 16px" for="adult">
        <input type="checkbox" id="adult" />
        Jag intygar 18+ och samtycke mellan vuxna.
      </label>

      <div class="actions">
        <!-- VIKTIGT: type="button" + inline fallback -->
        <button class="btn btn-primary" id="btnEnter" type="button" disabled onclick="enterSite()">Skapa berättelse</button>
        <a class="btn btn-ghost" href="#" id="openConnect">Öppna BlushConnect</a>
      </div>
      <p class="muted" style="margin-top:10px">© Blush Narratives</p>
    </section>

    <!-- SKAPA -->
    <section id="create" class="card hidden">
      <h2>Skapa egen berättelse</h2>

      <div class="row">
        <div class="col">
          <label for="length">Längd</label>
          <select id="length">
            <option value="3">3 minuter</option>
            <option value="5" selected>5 minuter</option>
            <option value="8">8 minuter</option>
            <option value="10">10 minuter</option>
          </select>
          <div class="muted" data-words>≈ 170 ord/min → ca 850 ord per 5 min.</div>
        </div>

        <div class="col">
          <label for="spice">Snusk-nivå</label>
          <input id="spice" type="range" min="1" max="5" step="1" value="2" />
          <div class="muted">1 = mild / 5 = hetare språk (alltid icke-grafiskt).</div>
        </div>

        <div class="col">
          <label for="voice">Röst</label>
          <select id="voice">
            <option value="alloy">Alloy (neutral)</option>
            <option value="verse">Verse (mjuk)</option>
            <option value="coral">Coral (varm)</option>// === Router/18+ gate ===========================================
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
          </select>
          <div class="muted">Gratis test-röster via OpenAI TTS.</div>
        </div>
      </div>

      <label for="idea" style="margin-top:14px">Din idé</label>
      <textarea id="idea" placeholder="Skriv din idé…"></textarea>

      <div class="actions" style="margin-top:10px">
        <button class="btn btn-ghost"   id="btnPreview" type="button">Förhandslyssna</button>
        <button class="btn btn-primary" id="btnRead" type="button">Läs upp</button>
        <button class="btn btn-ghost"   id="btnDownload" type="button">Ladda ner .txt</button>
      </div>

      <div id="status" class="muted"></div>
      <audio id="player" controls style="width:100%;margin-top:10px"></audio>

      <h3 style="margin-top:18px">Utdrag</h3>
      <div id="excerpt" class="muted" style="min-height:40px"></div>
    </section>
  </div>

  <script src="app.js" defer></script>
</body>
</html>
