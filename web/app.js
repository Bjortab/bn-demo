// app.js – GC v1.6.0

const API = "https://bn-worker.bjorta-bb.workers.dev/api/v1";
let session = null;
let character = null;
let arc = null;

// Säkra DOM-sättare
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setHtml(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = val;
}

// Initiera statusfältet
async function initStatus() {
  try {
    const res = await fetch(`${API}/status`);
    const data = await res.json();
    setText("status-worker", data.version || "–");
    setText("status-provider", data.provider || "–");
    setText("status-mock", data.flags?.MOCK ? "ON" : "OFF");
  } catch (err) {
    console.error("status error", err);
  }
  setText("status-session", session ? "ok" : "ingen");
}
initStatus();

// Anonym session
document.getElementById("btn-session").onclick = async () => {
  try {
    const res = await fetch(`${API}/session`, { method: "POST" });
    session = await res.json();
    setText("status-session", "ok");
    setHtml("result", JSON.stringify(session, null, 2));
  } catch (err) {
    console.error(err);
    setHtml("result", "Error: " + err.message);
  }
};

// Skapa karaktär
document.getElementById("btn-character").onclick = async () => {
  if (!session) return setHtml("result", "Skapa först en anonym session!");
  const name = document.getElementById("char-name").value.trim();
  if (!name) return setHtml("result", "Skriv in ett namn!");
  try {
    const res = await fetch(`${API}/characters/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: session.user_id, name })
    });
    character = await res.json();
    setHtml("result", JSON.stringify(character, null, 2));
  } catch (err) {
    console.error(err);
    setHtml("result", "Error: " + err.message);
  }
};

// Skapa arc
document.getElementById("btn-arc").onclick = async () => {
  if (!session || !character) return setHtml("result", "Skapa session och karaktär först!");
  const title = document.getElementById("arc-title").value.trim();
  if (!title) return setHtml("result", "Skriv in en titel för arc!");
  try {
    const res = await fetch(`${API}/arcs/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: session.user_id, character_id: character.id, title })
    });
    arc = await res.json();
    setHtml("result", JSON.stringify(arc, null, 2));
  } catch (err) {
    console.error(err);
    setHtml("result", "Error: " + err.message);
  }
};

// Generera berättelse
document.getElementById("btn-generate").onclick = async () => {
  if (!session || !character || !arc) return setHtml("result", "Skapa session, karaktär och arc först!");
  const prompt = document.getElementById("prompt").value.trim();
  const level = document.querySelector("input[name='level']:checked").value;
  const lang = document.getElementById("lang").value;
  const words = parseInt(document.getElementById("words").value, 10);
  try {
    const res = await fetch(`${API}/episodes/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: session.user_id,
        character_id: character.id,
        arc_id: arc.id,
        prompt,
        level,
        lang,
        words
      })
    });
    const story = await res.json();
    setHtml("result", JSON.stringify(story, null, 2));
  } catch (err) {
    console.error(err);
    setHtml("result", "Error: " + err.message);
  }
};

// Lista avsnitt
document.getElementById("btn-list").onclick = async () => {
  if (!session || !character) return setHtml("result", "Skapa session och karaktär först!");
  try {
    const res = await fetch(`${API}/episodes/by-character?user_id=${session.user_id}&character_id=${character.id}`);
    const list = await res.json();
    setHtml("result", JSON.stringify(list, null, 2));
  } catch (err) {
    console.error(err);
    setHtml("result", "Error: " + err.message);
  }
};

// Feedback (mockad)
document.getElementById("btn-feedback").onclick = () => {
  setHtml("result", "Feedback mottagen (mock). Tack!");
};
