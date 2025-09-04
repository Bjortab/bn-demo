// web/app.js v1.5.4 – BN Demo

const API = "https://bn-worker.bjorta-bb.workers.dev/api/v1";

// Hjälpfunktion för att visa resultat i UI
function showResult(msg) {
  const el = document.getElementById("result");
  if (el) {
    el.textContent = msg;
  } else {
    console.log("RESULT:", msg);
  }
}

// --- SKAPA SESSION ---
async function createSession() {
  try {
    const res = await fetch(`${API}/session`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Misslyckades skapa session");
    window.bnSession = data;
    showResult("Session skapad ✅");
    console.log("SESSION:", data);
  } catch (err) {
    showResult(`Error: ${err.message}`);
  }
}

// --- SKAPA KARAKTÄR ---
async function createCharacter() {
  try {
    if (!window.bnSession) throw new Error("Saknar session – skapa först.");
    const name = document.getElementById("charname")?.value || "Okänd";
    const res = await fetch(`${API}/characters/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: window.bnSession.user_id,
        name,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Misslyckades skapa karaktär");
    window.bnCharacterId = data.character_id;
    showResult(`Karaktär skapad: ${name} ✅`);
    console.log("CHARACTER:", data);
  } catch (err) {
    showResult(`Error: ${err.message}`);
  }
}

// --- STARTA ARC ---
async function startArc() {
  try {
    if (!window.bnSession || !window.bnCharacterId)
      throw new Error("Saknar session/karaktär.");
    const title = document.getElementById("arcname")?.value || "Första mötet";
    const res = await fetch(`${API}/arcs/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: window.bnSession.user_id,
        character_id: window.bnCharacterId,
        title,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Misslyckades starta arc");
    window.bnArcId = data.arc_id;
    showResult(`Arc startad: ${title} ✅`);
    console.log("ARC:", data);
  } catch (err) {
    showResult(`Error: ${err.message}`);
  }
}

// --- GENERERA BERÄTTELSE ---
async function generate() {
  try {
    if (!window.bnSession) throw new Error("Saknar session – skapa först.");
    if (!window.bnCharacterId) throw new Error("Saknar karaktär.");
    if (!window.bnArcId) throw new Error("Saknar arc.");

    const level = Number(
      document.querySelector('input[name="level"]:checked')?.value || 2
    );
    const lang = document.getElementById("lang")?.value || "sv";
    const words = Number(document.getElementById("words")?.value || 180);
    const prompt = (document.getElementById("prompt")?.value || "").trim();

    const res = await fetch(`${API}/episodes/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: window.bnSession.user_id,
        character_id: window.bnCharacterId,
        arc_id: window.bnArcId,
        prompt,
        level,
        lang,
        words,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      showResult(`Error: ${res.status} ${res.statusText}\n${JSON.stringify(data)}`);
      return;
    }

    // 🔹 Visa bara berättelsetexten, plus ev. systemheader
    const header = data?.system ? data.system + "\n\n" : "";
    const text = data?.text || "(tomt svar)";
    showResult(header + text);

    window.bnLastEpisode = data;
    console.log("EPISODE:", data);
  } catch (err) {
    showResult(`Error: ${err.message}`);
  }
}

// --- LISTA AVSNITT ---
async function listEpisodes() {
  try {
    if (!window.bnSession || !window.bnCharacterId)
      throw new Error("Saknar session/karaktär.");
    const res = await fetch(`${API}/episodes/by-character`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: window.bnSession.user_id,
        character_id: window.bnCharacterId,
        limit: 10,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Misslyckades lista avsnitt");
    showResult(JSON.stringify(data.items || [], null, 2));
    console.log("EPISODES:", data);
  } catch (err) {
    showResult(`Error: ${err.message}`);
  }
}
