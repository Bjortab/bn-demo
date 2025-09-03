// --- Konfig ---
const API = "https://bn-worker.bjorta-bb.workers.dev/api/v1"; // ändra vid behov

// --- Hjälpare ---
const $ = (id) => document.getElementById(id);
const post = (p, d = {}) =>
  fetch(`${API}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  }).then((r) => r.json());
const get = (p) => fetch(`${API}${p}`).then((r) => r.json());

function saveLocal(key, v) { localStorage.setItem(key, JSON.stringify(v)); }
function loadLocal(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }

// --- Nivåbeskrivningar ---
const levelDescriptions = {
  1: "Romantisk: känslor & stämning. Inga kroppsliga detaljer, inga könsord.",
  2: "Antydande sensuell: beröring & metaforer. Inga könsord.",
  3: "Sensuell+: mild explicit. Vaga anatomiska ord, ej grova uttryck.",
  4: "Het: explicit men stilrent. Detaljer tillåtna, undviker grövsta fraser.",
  5: "Explicit: raka ord & tydliga beskrivningar (inom regler & lag)."
};

// --- State ---
let SESSION = null;
let CHARACTER = null;
let ARC = null;
let LEVEL = 2; // default

// --- Init ---
(async function init() {
  $("statusText").textContent = "Hämtar status…";
  try {
    const s = await get("/status");
    $("statusText").textContent = `Version: ${s.version}, mock: ${s.mock ? "ON" : "OFF"}`;
    $("providerPill").textContent = `worker ${s.version}${s.mock ? " (mock)" : ""}`;
  } catch {
    $("statusText").textContent = "Kunde inte läsa status";
  }

  // Session
  SESSION = loadLocal("bn:session");
  if (!SESSION) {
    SESSION = await get("/session");
    saveLocal("bn:session", SESSION);
  }
  $("statusText").textContent += ` | user: ${SESSION.user_id.slice(0, 8)}…`;

  // Förifyll
  $("charName").value = "Nadja";
  $("arcTitle").value = "Första mötet";

  // Init nivåknappar
  setupLevelButtons();
  renderLevelDesc();
})();

// --- Nivå UI ---
function setupLevelButtons() {
  const container = $("levels");
  container.querySelectorAll(".lvl-btn").forEach(btn => {
    const n = Number(btn.dataset.level);
    btn.dataset.active = (n === LEVEL) ? "true" : "false";
    btn.onclick = () => {
      LEVEL = n;
      container.querySelectorAll(".lvl-btn").forEach(b => b.dataset.active = "false");
      btn.dataset.active = "true";
      renderLevelDesc();
    };
  });
}
function renderLevelDesc() {
  $("lvlDesc").textContent = `${LEVEL} – ${levelDescriptions[LEVEL]}`;
}

// --- UI actions ---
$("btnCreateChar").onclick = async () => {
  if (!SESSION) return alert("Ingen session");
  const name = $("charName").value.trim();
  if (!name) return alert("Ange namn");
  const res = await post("/characters/create", { user_id: SESSION.user_id, name });
  CHARACTER = res;
  $("charInfo").textContent = `id: ${res.character_id}`;
  saveLocal("bn:character", CHARACTER);
};

$("btnStartArc").onclick = async () => {
  if (!SESSION) return alert("Ingen session");
  CHARACTER = CHARACTER || loadLocal("bn:character");
  if (!CHARACTER) return alert("Skapa karaktär först");
  const title = $("arcTitle").value.trim();
  if (!title) return alert("Ange titel");
  const res = await post("/arcs/start", {
    user_id: SESSION.user_id,
    character_id: CHARACTER.character_id,
    title,
    level_min: 1,
    level_max: 5,
  });
  ARC = res;
  $("arcInfo").textContent = `arc_id: ${res.arc_id}`;
  saveLocal("bn:arc", ARC);
};

$("btnGenerate").onclick = async () => {
  try {
    if (!SESSION) return alert("Ingen session");
    CHARACTER = CHARACTER || loadLocal("bn:character");
    if (!CHARACTER) return alert("Skapa karaktär först");
    ARC = ARC || loadLocal("bn:arc");
    if (!ARC) return alert("Starta en arc först");

    const payload = {
      user_id: SESSION.user_id,
      character_id: CHARACTER.character_id,
      arc_id: ARC.arc_id,
      prompt: $("prompt").value,
      level: LEVEL,                       // <-- nivå från knappar
      lang: $("lang").value,
      words: Number($("words").value),
      make_audio: false,
    };

    const res = await post("/episodes/generate", payload);
    $("resultCard").style.display = "block";
    $("story").textContent = res.story || "(tom)";
    $("summary").textContent = res.summary || "";
    $("memory").textContent = res.memory_summary || "";

    await listEpisodes();
  } catch (e) {
    console.error(e);
    alert("Kunde inte generera");
  }
};

$("btnList").onclick = listEpisodes;

async function listEpisodes() {
  if (!SESSION) return;
  CHARACTER = CHARACTER || loadLocal("bn:character");
  if (!CHARACTER) return;
  const r = await post("/episodes/by-character", {
    user_id: SESSION.user_id,
    character_id: CHARACTER.character_id,
    limit: 50,
  });
  const ul = $("list");
  ul.innerHTML = "";
  (r.items || []).forEach((it) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div><b>${new Date(it.created_at || Date.now()).toLocaleString()}</b></div>
      <div class="muted">nivå ${it.level} • steg ${it.arc_step} • ${it.lang || "sv"}</div>
      <div class="mono">${(it.episode_summary || "").slice(0, 220)}</div>
    `;
    ul.appendChild(li);
  });
}

// --- Feedback (oförändrad från tidigare) ---
$("btnFeedback").onclick = async () => {
  try {
    const topic = prompt("Ämne (valfritt):", "");
    if (topic === null) return;
    const message = prompt("Beskriv problemet eller skriv din fråga (krävs):", "");
    if (message === null) return;
    if (!message.trim()) return alert("Meddelande krävs.");
    const email = prompt("Din e-post (valfritt):", "");
    const user_id = (SESSION && SESSION.user_id) ? SESSION.user_id : null;
    const res = await post("/feedback/submit", { user_id, email, topic, message });
    if (res && res.ok) alert("Tack! Din feedback är mottagen.");
    else alert("Kunde inte spara feedback just nu.");
  } catch (e) {
    console.error(e);
    alert("Något gick fel när feedback skulle skickas.");
  }
};
