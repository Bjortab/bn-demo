// === Konfiguration ===
const API = "https://bn-worker.bjorta-bb.workers.dev/api/v1"; // din worker
const TEMPERATURE = 0.8;

// === Hjälp ===
const $ = (sel) => document.querySelector(sel);
const storyEl = $("#story");
const metaEl  = $("#meta");
const audioEl = $("#player");
$("#apiUrl").textContent = API;

// Mappa minuter -> ungefärliga ord (för 150–180 ord/min läsning).
function minutesToWords(min) {
  const wpm = 160; // konservativt
  return Math.max(120, Math.round(min * wpm));
}

function paragraphize(text) {
  // Säkerställ stycken även om modellen skickar allt i ett block
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .join("\n\n");
}

// === Röst (Web Speech API: bra “browser fallback”) ===
let voices = [];
function loadVoices() {
  voices = speechSynthesis.getVoices();
  const sel = $("#voice");
  sel.innerHTML = "";
  // Prioritera svenska
  const sv = voices.filter(v => /sv|swedish/i.test(v.lang));
  const list = sv.length ? sv : voices;
  list.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(opt);
  });
}
if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}

function speak(text) {
  try {
    speechSynthesis.cancel(); // avbryt ev. pågående
    const sel = $("#voice");
    const name = sel.value;
    const voice = speechSynthesis.getVoices().find(v => v.name === name);
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || ($("#lang").value === "sv" ? "sv-SE" : "en-US");
    // lite mjukare inställningar
    u.rate = 0.95;
    u.pitch = /female|woman|kvinna|siri/i.test((voice?.name||"")) ? 1.05 : 1.0;
    speechSynthesis.speak(u);
  } catch (e) {
    console.warn("TTS fail (browser)", e);
  }
}

$("#stop").addEventListener("click", () => {
  speechSynthesis.cancel();
  audioEl.pause();
  audioEl.currentTime = 0;
});

// === Generera ===
$("#go").addEventListener("click", async () => {
  const prompt = ($("#prompt").value || "").trim();
  const level  = Number($("#level").value);
  const minutes= Number($("#minutes").value);
  const lang   = $("#lang").value || "sv";
  const words  = minutesToWords(minutes);

  if (!prompt) { alert("Skriv en kort startprompt."); return; }

  // UI state
  $("#go").disabled = true;
  storyEl.textContent = "Skapar berättelse …";
  metaEl.textContent  = `target ≈ ${words} ord • nivå ${level} • temp ${TEMPERATURE}`;

  try {
    // (A) Skapa eller återanvänd demo-session (backend kan ignorera om ej behövs)
    const user_id = "demo";
    const char_id = "demo-char";
    const arc_id  = "demo-arc";

    // (B) Kalla worker: generate
    const res = await fetch(`${API}/episodes/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id, character_id: char_id, arc_id,
        level, lang, words, prompt,
        temperature: TEMPERATURE
      })
    });

    if (!res.ok) {
      const err = await res.text().catch(()=>res.statusText);
      throw new Error(`HTTP ${res.status}: ${err}`);
    }
    const data = await res.json();

    const text = paragraphize(String(data.text || data.story || ""));
    storyEl.textContent = text || "(tomt svar)";

    // (C) Spela upp (browser-röst fallback)
    speak(text);

    // (D) Om worker ger TTS-URL (t.ex. data.audio_url) så använd den istället:
    if (data.audio_url) {
      try {
        speechSynthesis.cancel();
        audioEl.src = data.audio_url;
        await audioEl.play();
      } catch (e) {
        console.warn("Kunde inte spela upp audio_url, faller tillbaka till browser TTS.", e);
      }
    }
  } catch (e) {
    console.error(e);
    alert(`Fel: ${e.message}`);
    storyEl.textContent = `Fel: ${e.message}`;
  } finally {
    $("#go").disabled = false;
  }
});
