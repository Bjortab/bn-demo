// ======= Konfig =======
const API_BASE = "https://bn-worker.bjorta-bb.workers.dev/api/v1";  // <- din worker
const LANG = "sv";
const TEMPERATURE = 0.8; // alltid 0.8 enligt ditt önskemål

// ======= UI-hjälp =======
const $ = (sel) => document.querySelector(sel);
const out = $("#out");
const meta = $("#meta");
const sessionPill = $("#sessionPill");
const workerPill = $("#workerPill");
const apiSpan = $("#api");
const btnRun = $("#btnRun");
const btnStop = $("#btnStop");
const btnAgain = $("#btnAgain");
const player = $("#player");

apiSpan.textContent = API_BASE;

// Web Speech
let lastUtter = null;
function speak(text, gender = "female") {
  try {
    if (!window.speechSynthesis) {
      console.warn("Ingen speechSynthesis tillgänglig.");
      return;
    }
    stopSpeak();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "sv-SE";
    // enkel heuristik för röstval
    const voices = speechSynthesis.getVoices();
    const pick = (want) => {
      const v = voices.find(v => v.lang?.toLowerCase().startsWith("sv") && v.name.toLowerCase().includes(want));
      return v || voices.find(v => v.lang?.toLowerCase().startsWith("sv")) || voices[0];
    };
    if (gender === "male") u.voice = pick("male");
    else if (gender === "female") u.voice = pick("female");
    else u.voice = pick(""); // första svenska

    u.rate = 1.0;
    u.pitch = gender === "male" ? 0.9 : gender === "female" ? 1.1 : 1.0;
    speechSynthesis.speak(u);
    lastUtter = u;
  } catch(e) { console.error(e); }
}
function stopSpeak() {
  try {
    if (window.speechSynthesis) speechSynthesis.cancel();
    lastUtter = null;
  } catch(_) {}
}

// ======= API helpers =======
async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${t}`);
  }
  return res.json();
}

function setBusy(b) { btnRun.disabled = b; }

function setMeta(info) {
  meta.textContent = info;
}

function show(o) {
  out.textContent = typeof o === "string" ? o : JSON.stringify(o, null, 2);
}

// ======= Huvudflöde =======
let lastText = "";

async function run() {
  setBusy(true);
  stopSpeak();
  show("…");

  try {
    setMeta("Kollar workerstatus…");
    const st = await api("/status");
    workerPill.textContent = `worker: ${st.worker} v${st.v}`;
    setMeta("Skapar session…");

    const s = await api("/session", { method:"POST" });
    const USER_ID = s.user_id; // från worker
    sessionPill.textContent = `session: ${USER_ID.slice(0, 8)}…`;

    setMeta("Skapar karaktär…");
    const name = $("#name").value.trim() || "Mia";
    const c = await api("/characters/create", {
      method: "POST",
      body: { user_id: USER_ID, name }
    });
    const CHAR_ID = c.character_id;

    setMeta("Startar arc…");
    const title = "Första mötet";
    const a = await api("/arcs/start", {
      method: "POST",
      body: { user_id: USER_ID, character_id: CHAR_ID, title }
    });
    const ARC_ID = a.arc_id;

    setMeta("Genererar avsnitt…");
    const level = Number($("#level").value);
    const words = Number($("#words").value);
    const prompt = $("#prompt").value.trim();
    const gender = $("#voice").value;

    const g = await api("/episodes/generate", {
      method: "POST",
      body: {
        user_id: USER_ID,
        character_id: CHAR_ID,
        arc_id: ARC_ID,
        level,
        lang: LANG,
        words,
        prompt,
        temperature: TEMPERATURE
      }
    });

    lastText = g.text || "";
    show({
      ok: g.ok,
      episode_id: g.episode_id,
      level: g.level,
      words: g.words,
      text: g.text,
      summary: g.summary,
      created_at: g.created_at
    });

    // Läs upp via web speech
    if (lastText) {
      speak(lastText, gender);
    }
    setMeta("Klar ✅");

  } catch (err) {
    console.error(err);
    alert(`Fel: ${err.message}`);
    show(String(err.message || err));
    setMeta("Fel ❌ (se utskrift)");
  } finally {
    setBusy(false);
  }
}

// ======= Event hooks =======
btnRun.addEventListener("click", run);
btnStop.addEventListener("click", stopSpeak);
btnAgain.addEventListener("click", () => {
  const gender = $("#voice").value;
  if (lastText) speak(lastText, gender);
});

// hint i UI
window.addEventListener("load", async () => {
  try {
    const st = await api("/status");
    workerPill.textContent = `worker: ${st.worker} v${st.v}`;
    sessionPill.textContent = "session: –";
    setMeta("Redo.");
  } catch {
    setMeta("Worker onåbar – kontrollera CORS/URL.");
  }
});
