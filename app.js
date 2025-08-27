// app.js

// Hjälpfunktion för DOM
const $ = (q) => document.querySelector(q);

// UI-element
const selLevel = $("#level");       // <select id="level">
const selLength = $("#length");     // <select id="length">
const selVoice = $("#voice");       // <select id="voice">
const selTempo = $("#tempo");       // <input id="tempo">
const input = $("#idea");           // <textarea id="idea">
const divOut = $("#output");        // <div id="output">
const btnGen = $("#generateBtn");   // <button id="generateBtn">
const btnPlay = $("#listenBtn");    // <button id="listenBtn">
const btnStop = $("#stopBtn");      // <button id="stopBtn">
const elApiOk = $("#apiok");        // <span id="apiok">

// API-bas (Cloudflare Pages functions)
const BASE = location.origin + "/api";

// Rad ~30: Health check
async function checkHealth() {
  try {
    const res = await fetch(BASE + "/health");
    const ok = res.ok;
    if (elApiOk) elApiOk.textContent = ok ? "ok" : "fail";
  } catch {
    if (elApiOk) elApiOk.textContent = "fail";
  }
}
checkHealth();

// Rad ~45: Busy/idle helpers
function setBusy(b) {
  btnGen.disabled = b;
  btnPlay.disabled = b;
  btnStop.disabled = b;
}

// Rad ~55: Generera berättelse
btnGen.addEventListener("click", async () => {
  setBusy(true);
  divOut.textContent = "(genererar …)";
  try {
    // FIX → payload med rätt fält
    const payload = {
      idea: input.value.trim(),
      level: parseInt(selLevel.value, 10),
      minutes: parseInt(selLength.value, 10)
    };

    const res = await fetch(BASE + "/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      divOut.textContent = "(kunde inte generera – prova igen)";
      console.error("generate error", data);
    } else {
      divOut.textContent = data.story || "(tomt)";
    }
  } catch (err) {
    console.error("generate exception", err);
    divOut.textContent = "(fel vid generering)";
  }
  setBusy(false);
});

// Rad ~95: Lyssna
btnPlay.addEventListener("click", async () => {
  try {
    const text = divOut.textContent.trim();
    if (!text) return;
    const res = await fetch(BASE + "/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: selVoice.value,
        speed: parseFloat(selTempo.value)
      })
    });
    if (!res.ok) throw new Error("TTS fel");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
  } catch (err) {
    console.error("tts error", err);
  }
});

// Rad ~120: Stoppa
btnStop.addEventListener("click", () => {
  // just nu inget aktivt Audio-objekt sparat
  // TODO: spara global referens om du vill kunna stoppa mitt i
  console.log("Stop clicked (ej implementerad fullt)");
});
