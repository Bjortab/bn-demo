// ====== KONFIG ======
const API_BASE = "https://bn-worker.bjorta-bb.workers.dev/api/v1"; // ändra vid behov

// Hjälpare
const $ = (sel) => document.querySelector(sel);
const log = (msg, obj) => {
  const el = $("#log");
  const time = new Date().toLocaleTimeString();
  let line = `[${time}] ${msg}`;
  if (obj !== undefined) {
    try { line += " " + JSON.stringify(obj, null, 2); }
    catch { line += " " + String(obj); }
  }
  el.textContent = line + "\n" + el.textContent;
};

function setButtons(enabled) {
  $("#btnPing").disabled = !enabled;
  $("#btnWho").disabled = !enabled;
}

// Skriv ut API-bas i UI
$("#apiBaseHint").textContent = API_BASE;

// ====== Event wiring ======
window.addEventListener("DOMContentLoaded", () => {
  $("#btnSession")?.addEventListener("click", onCreateSession);
  $("#btnPing")?.addEventListener("click", onPing);
  $("#btnWho")?.addEventListener("click", onWho);
  log("UI redo.");
});

// ====== Actions ======
async function onCreateSession() {
  log("Skapar anonym session…");
  try {
    const res = await fetch(`${API_BASE}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const txt = await safeText(res);
      throw new Error(`HTTP ${res.status} ${res.statusText} – ${txt}`);
    }
    const data = await res.json();
    window.BN_SESSION = data; // spara globalt
    $("#sessionOut").textContent = JSON.stringify(data, null, 2);
    setButtons(true);
    log("Session skapad ✅", data);
  } catch (err) {
    log("Fel vid skapande av session ❌", String(err));
  }
}

async function onPing() {
  try {
    const res = await fetch(`${API_BASE}/status`);
    const data = await res.json().catch(()=> ({}));
    log("Status:", data);
  } catch (e) { log("Status-fel:", String(e)); }
}

async function onWho() {
  try {
    const res = await fetch(`${API_BASE}/session`, { method: "GET" });
    const data = await res.json().catch(()=> ({}));
    log("Session (GET):", data);
  } catch (e) { log("GET /session fel:", String(e)); }
}

// Säker text-läsning från Response
async function safeText(res){
  try { return await res.text(); } catch { return ""; }
}
