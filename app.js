// ===== Din Pages-bas här (håll tomt för samma domän) =====
const API_BASE = ""; // ex: ""  → använder samma domän: /api/...

// ===== Säker DOM-init =====
document.addEventListener("DOMContentLoaded", () => {
  const els = {
    length:     document.getElementById("length"),
    spice:      document.getElementById("spice"),
    voice:      document.getElementById("voice"),
    words:      document.getElementById("words"),
    spiceNote:  document.getElementById("spiceNote"),
    prompt:     document.getElementById("prompt"),
    btnPreview: document.getElementById("btnPreview"),
    btnRead:    document.getElementById("btnRead"),
    btnDownload:document.getElementById("btnDownload"),
    status:     document.getElementById("status"),
    excerpt:    document.getElementById("excerpt"),
    player:     document.getElementById("player"),
    blushConnect: document.getElementById("blushConnect"),
  };

  // Kontroll – varna om något saknas (förhindrar null.value-felet)
  const missing = Object.entries(els)
    .filter(([k,v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.error("Saknade element i DOM:", missing);
    alert("Fel i sidan: saknade element: " + missing.join(", "));
    return;
  }

  // —— UI-hjälp —— //
  function calcWords(mins){ return Math.round(Number(mins) * 170); }
  function updateWords(){
    els.words.textContent = `≈ 170 ord/min → ca ${calcWords(els.length.value)} ord`;
  }
  function updateSpiceNote(){
    const s = Number(els.spice.value||2);
    const map = {
      1: "Nivå 1 = mild / romantisk.",
      2: "Nivå 2 = mild med varm stämning.",
      3: "Nivå 3 = mer laddat språk.",
      4: "Nivå 4 = explicit (inga minderåriga/icke-samtycke).",
      5: "Nivå 5 = fullt explicit (t.ex. 'kuk', 'fitta', 'knulla')."
    };
    els.spiceNote.textContent = map[s] || map[2];
  }
  updateWords();
  updateSpiceNote();

  // Lyssna på förändringar
  ["change","input"].forEach(evt => {
    els.length.addEventListener(evt, updateWords);
    els.spice.addEventListener(evt, updateSpiceNote);
  });

  // Status
  function uiStatus(msg, type=""){ // type: "", "ok", "err"
    els.status.textContent = msg;
    els.status.classList.remove("ok","err");
    if (type) els.status.classList.add(type);
  }

  // API helper
  async function api(path, payload, expectAudio=false){
    const res = await fetch(`${API_BASE}/api/${path}`,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload||{})
    });
    if (!res.ok){
      const txt = await res.text().catch(()=>res.statusText);
      throw new Error(`${res.status} ${res.statusText}: ${txt}`);
    }
    return expectAudio ? res.blob() : res.json();
  }

  // Generera text
  let lastStory = "";  // sparar senaste fulla texten
  async function doGenerate(){
    const idea  = (els.prompt.value||"").trim();
    const mins  = Number(els.length.value||5);
    const spice = Number(els.spice.value||2);
    const voice = (els.voice.value||"alloy");

    if (!idea){
      uiStatus("Skriv en idé först.", "err");
      return null;
    }

    uiStatus("Genererar text…");
    const data = await api("generate",{ idea, mins, spice, voice });
    // Förväntat svar: { text, excerpt }
    if (!data || !data.text){
      uiStatus("Kunde inte generera text (tomt svar).","err");
      return null;
    }
    lastStory = data.text;
    els.excerpt.textContent = data.excerpt || (data.text.slice(0, 300)+"…");
    uiStatus("Text klar.","ok");
    return data.text;
  }

  // Läs upp (TTS)
  async function doRead(){
    try{
      const text = await doGenerate();
      if (!text) return;

      uiStatus("Skapar röst…");
      const voice = els.voice.value || "alloy";
      const blob = await api("tts",{ text, voice }, true); // audio/mpeg
      const url = URL.createObjectURL(blob);
      els.player.src = url;
      els.player.play().catch(()=>{/* användaren kan behöva trycka play */});
      uiStatus("Klar att spela upp.","ok");
    }catch(err){
      console.error(err);
      uiStatus("Generate failed: " + err.message, "err");
    }
  }

  // Bara förhandsvisa (ingen röst)
  async function doPreview(){
    try{
      await doGenerate();
    }catch(err){
      console.error(err);
      uiStatus("Förhandsvisning misslyckades: " + err.message, "err");
    }
  }

  // Ladda ner texten
  function doDownload(){
    if (!lastStory){
      uiStatus("Ingen text att ladda ner ännu.","err");
      return;
    }
    const blob = new Blob([lastStory], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "berattelse.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    uiStatus("Text nedladdad.","ok");
  }

  // Koppla knappar
  els.btnRead.addEventListener("click", doRead);
  els.btnPreview.addEventListener("click", doPreview);
  els.btnDownload.addEventListener("click", doDownload);

  // BlushConnect – placeholder (lägg in riktig länk när den finns)
  els.blushConnect.addEventListener("click", (e)=>{
    e.preventDefault();
    uiStatus("BlushConnect kommer snart ✨");
  });
});
