// Konfigurera din Worker-bas:
const API = "https://bn-worker.bjorta-bb.workers.dev/api/v1"; // <-- ändra om ditt subdomän skiljer

const $ = (id)=>document.getElementById(id);
const statusEl = $("status");

async function ping() {
  try {
    const r = await fetch(`${API}/status`);
    const j = await r.json();
    if (j.ok) {
      statusEl.textContent = `OK • worker=${j.worker} • v=${j.v} • tts=browser`;
    } else {
      statusEl.textContent = `Fel: ${j.error||'status'}`;
    }
  } catch (e) {
    statusEl.textContent = `Fel: kunde inte nå worker`;
  }
}

async function generate() {
  const body = {
    prompt: $("prompt").value,
    level: Number($("level").value),
    lang: $("lang").value,
    words: Number($("words").value||220)
  };
  $("out").textContent = "Genererar…";
  try {
    const r = await fetch(`${API}/episodes/generate`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || r.statusText);
    $("out").textContent = j.text;

    // Web Speech API (browser TTS)
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(j.text);
      u.lang = (body.lang === "sv" ? "sv-SE" : "en-US");
      // enkel röstval: kvinnlig/maskulin heuristik via name match (kan bytas sen)
      const voices = speechSynthesis.getVoices();
      const prefer = body.lang === "sv"
        ? (voices.find(v=>/sv.*(female|ema|Sofia|Alva)/i.test(v.name)) || voices.find(v=>/sv/i.test(v.lang)))
        : (voices.find(v=>/(female|Samantha|Serena)/i.test(v.name)) || voices.find(v=>/en/i.test(v.lang)));
      if (prefer) u.voice = prefer;
      u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
      speechSynthesis.speak(u);
    } catch (e) {
      console.warn("TTS fail (browser):", e);
    }
  } catch (e) {
    $("out").textContent = `Fel: ${e.message||e}`;
  }
}

$("go").addEventListener("click", generate);
$("stop").addEventListener("click", ()=>speechSynthesis.cancel());

window.addEventListener("load", ()=>{
  // i vissa browser måste röster laddas async
  speechSynthesis.onvoiceschanged = ()=>{};
  ping();
});
