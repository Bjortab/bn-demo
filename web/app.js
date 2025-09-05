// ===== GC test-app v201 =====

// 1) Konfigurera API-bas
// Ändra denna rad om du har annat worker-namn/domän.
const API_BASE = "https://bn-worker.bjorta-bb.workers.dev/api/v1";

// 2) Hjälp-funktioner
const $ = (sel) => document.querySelector(sel);
const log = (msg) => {
  const box = $("#log");
  const now = new Date().toISOString().slice(11,19);
  if (typeof msg === "object") {
    box.textContent = `[${now}] ${JSON.stringify(msg, null, 2)}\n`;
  } else {
    box.textContent = `[${now}] ${msg}\n` + (box.textContent || "");
  }
};

function setTag(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// 3) Event-wiring när DOM finns
window.addEventListener("DOMContentLoaded", () => {
  // visa API-länk
  const link = document.getElementById("apiLink");
  if (link) { link.textContent = API_BASE; link.href = API_BASE.replace(/\/api\/v1$/, "/api/v1/status"); }

  // knappar
  const btnSession = document.getElementById("btnSession");
  const btnPing    = document.getElementById("btnPing");
  const btnWho     = document.getElementById("btnWho");

  if (!btnSession || !btnPing || !btnWho) {
    log("Kritiskt: knappar hittades inte i DOM. Kontrollera index.html-id:n.");
    return;
  }

  btnSession.addEventListener("click", onCreateSession);
  btnPing.addEventListener("click", onPing);
  btnWho.addEventListener("click", onWho);

  log("APP READY – klicka en knapp.");
  // Hämta status direkt för att fylla taggarna
  onPing();
});

// 4) API-anrop
async function onPing() {
  try {
    const url = `${API_BASE}/status`;
    const r = await fetch(url, { method: "GET" });
    const data = await r.json();
    setTag("tag-worker",  `worker: v${data?.version || "?"}`);
    setTag("tag-provider",`provider: ${data?.provider || "?"}`);
    setTag("tag-mock",    `mock: ${data?.flags?.MOCK ? "ON" : "OFF"}`);
    log({ok:true, from:"/status", data});
  } catch (e) {
    log(`Fel i /status: ${e}`);
    console.error(e);
  }
}

async function onCreateSession() {
  try {
    const url = `${API_BASE}/session`;
    const r = await fetch(url, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({})
    });
    const data = await r.json();
    if (r.ok && data?.user_id) {
      sessionStorage.setItem("bn_user_id", data.user_id);
      setTag("tag-session", `session: ${data.user_id.slice(0,8)}…`);
    }
    log({ok:r.ok, from:"/session", data});
  } catch (e) {
    log(`Fel i /session: ${e}`);
    console.error(e);
  }
}

async function onWho() {
  try {
    const user_id = sessionStorage.getItem("bn_user_id");
    if (!user_id) { log("Ingen session – skapa först."); return; }
    const url = `${API_BASE}/whoami?user_id=${encodeURIComponent(user_id)}`;
    const r = await fetch(url);
    const data = await r.json();
    log({ok:r.ok, from:"/whoami", data});
  } catch (e) {
    log(`Fel i /whoami: ${e}`);
    console.error(e);
  }
}
