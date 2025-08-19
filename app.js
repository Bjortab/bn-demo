document.addEventListener("DOMContentLoaded", () => {
  // Safe helpers
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];

  // Elements (may be null on broken HTML – guard!)
  const openConnectBtn = $("#openConnect");
  const closeConnectBtn = $("#closeConnect");
  const connectPanel   = $("#connect");
  const levelRow       = $("#levelRow");
  const playPauseBtn   = $("#playPause");
  const seekBar        = $("#seek");
  const storyTitle     = $("#storyTitle");
  const storyDesc      = $("#storyDesc");
  const generateBtn    = $("#generateStory");
  const customPrompt   = $("#customPrompt");
  const storyDialog    = $("#storyDialog");
  const dialogTitle    = $("#dialogTitle");
  const dialogContent  = $("#dialogContent");
  const closeDialogBtn = $("#closeDialog");

  // ==== Enable clicks even if something overlays ====
  // (CSS already disables pointer-events när connect är stängd)

  // ==== BlushConnect ====
  openConnectBtn?.addEventListener("click", () => {
    connectPanel?.setAttribute("aria-hidden","false");
  });
  closeConnectBtn?.addEventListener("click", () => {
    connectPanel?.setAttribute("aria-hidden","true");
  });

  // ==== Levels (visuellt + spar i sessionStorage) ====
  levelRow?.addEventListener("click", e=>{
    const b = e.target.closest(".lvl");
    if(!b) return;
    $$(".lvl").forEach(x=>x.setAttribute("aria-pressed","false"));
    b.setAttribute("aria-pressed","true");
    sessionStorage.setItem("bn-level", b.dataset.level);
  });

  // ==== TTS (Web Speech) ====
  const synth = window.speechSynthesis;
  let speaking = false, progressTimer = null;
  const sampleText = "Det här är ett kort, sensuellt röstprov. Luta dig tillbaka, andas mjukt, och låt orden landa långsamt.";

  function pickVoice(){
    try{
      const v = synth?.getVoices?.() || [];
      const sv = v.filter(x=>/sv-SE/i.test(x.lang));
      return sv[0] || v.find(x=>/sv/i.test(x.lang)) || v[0] || null;
    }catch{return null}
  }

  function speak(text){
    if(!("speechSynthesis" in window)){ alert("Din webbläsare saknar talsyntes."); return; }
    try{ synth.cancel(); }catch{}
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if(v) u.voice = v;
    u.lang  = (v && v.lang) || "sv-SE";
    u.rate  = 0.95;
    u.pitch = 1.05;
    u.onstart = startProgress;
    u.onend   = ()=> stopProgress(true);
    synth.speak(u);
  }

  function startProgress(){
    speaking = true;
    if(playPauseBtn) playPauseBtn.textContent = "⏸";
    if(seekBar) seekBar.value = 0;
    clearInterval(progressTimer);
    progressTimer = setInterval(()=>{
      if(!seekBar) return;
      const val = Math.min(100, (+seekBar.value + 2));
      seekBar.value = val;
    }, 200);
  }
  function stopProgress(done=false){
    speaking = false;
    clearInterval(progressTimer); progressTimer=null;
    if(playPauseBtn) playPauseBtn.textContent = "▶";
    if(done && seekBar) seekBar.value = 0;
  }

  playPauseBtn?.addEventListener("click", ()=>{
    if(speaking && !synth?.paused){
      synth.pause?.(); if(playPauseBtn) playPauseBtn.textContent="▶";
    }else if(synth?.paused){
      synth.resume?.(); if(playPauseBtn) playPauseBtn.textContent="⏸";
    }else{
      if(storyTitle) storyTitle.textContent = "Röstprov spelas";
      if(storyDesc)  storyDesc.textContent  = "Sensuell provläsning via talsyntes";
      speak(sampleText);
    }
  });

  seekBar?.addEventListener("input", ()=>{/* visual only */});

  // ==== Create (placeholder) ====
  generateBtn?.addEventListener("click", ()=>{
    const prompt = (customPrompt?.value||"").trim();
    if(!prompt) return alert("Skriv något först!");
    if(dialogTitle)   dialogTitle.textContent   = "Din berättelse";
    if(dialogContent) dialogContent.textContent = `Skapad utifrån: "${prompt}"\n\n(Här kommer AI-text och uppläsning i nästa steg)`;
    storyDialog?.showModal?.();
  });
  closeDialogBtn?.addEventListener("click", ()=> storyDialog?.close?.());

  // ==== Demo-personer ====
  const peopleList = $("#peopleList");
  [{name:"Luna",level:"3"},{name:"Adrian",level:"5"},{name:"Mika",level:"1"}]
  .forEach(p=>{
    if(!peopleList) return;
    const div = document.createElement("div");
    div.className="person";
    div.innerHTML = `<div class="p-top"><span class="p-alias">${p.name}</span><span class="p-badge">Nivå ${p.level}</span></div>`;
    peopleList.appendChild(div);
  });

  // Trigger röstlista-initialisering i iOS
  if("speechSynthesis" in window){
    const touchVoices = ()=> synth.getVoices();
    window.speechSynthesis.onvoiceschanged = touchVoices;
    setTimeout(touchVoices, 200);
  }
});
