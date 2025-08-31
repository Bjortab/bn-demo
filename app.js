/* app.js — BN front v1.3.3 (Cloudflare)
   Fixar: TTS stack overflow, dubbel-lyssnare, iOS-uppspelning, “startar för tidigt”.
*/

(() => {
  const d = document;

  // UI
  const levelEl    = d.getElementById("level");
  const lengthEl   = d.getElementById("length");
  const voiceEl    = d.getElementById("voice");
  const tempoEl    = d.getElementById("tempo");
  const ideaEl     = d.getElementById("userIdea");
  const genBtn     = d.getElementById("generateBtn");
  const listenBtn  = d.getElementById("listenBtn");
  const stopBtn    = d.getElementById("stopBtn");
  const storyEl    = d.getElementById("story");
  const outEl      = d.getElementById("output");
  const providerEl = d.getElementById("provider");
  const modelEl    = d.getElementById("model");
  const statusEl   = d.getElementById("status");

  // Audio element
  const audioEl = d.getElementById("audio");

  // State
  let busyGen = false;
  let ttsBusy = false;
  let ttsReady = false;
  let lastText = "";
  let lastAudioB64 = "";
  let hasPlayedOnce = false;  // iOS autoplay vakt
  let playInFlight = false;   // skyddar mot upprepade .play()

  const BASE = location.origin;

  function log(line) {
    const ts = new Date().toLocaleTimeString();
    outEl.textContent += `\n[${ts}] ${line}`;
    outEl.scrollTop = outEl.scrollHeight;
  }
  function setStatus(s) { statusEl.textContent = s || ""; }
  function setBusy(on) {
    busyGen = !!on;
    genBtn.disabled = busyGen;
    listenBtn.disabled = busyGen || !ttsReady;
    stopBtn.disabled = !busyGen && !ttsBusy;
  }

  // -------------------------------
  // Helpers
  // -------------------------------
  function resetAudio() {
    // Ta bort alla event-lyssnare genom att klona elementet (billigt och säkert)
    const clone = audioEl.cloneNode(true);
    audioEl.replaceWith(clone);
    // Uppdatera referensen
    audioEl = d.getElementById("audio");
    audioEl.preload = "none";
    audioEl.src = "";
    hasPlayedOnce = false;
    playInFlight = false;
  }

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return { ok: res.ok, status: res.status, json, raw: text };
    } catch (e) {
      return { ok: false, status: res.status, json: null, raw: text, parseError: e };
    }
  }

  function fullStop(reason = "") {
    resetAudio();
    ttsBusy = false;
    ttsReady = false;
    if (reason) log(`Stop: ${reason}`);
    setBusy(false);
  }

  function hasEndMarker(s) {
    return /\[SLUT\]/i.test(s);
  }

  // -------------------------------
  // GENERATE
  // -------------------------------
  genBtn.addEventListener("click", generate);
  stopBtn.addEventListener("click", () => fullStop("user"));

  async function generate() {
    if (busyGen) return;
    const idea   = (ideaEl.value || "").trim();
    const level  = parseInt(levelEl.value || "3", 10);
    const minutes= parseInt(lengthEl.value || "5", 10);
    const tempo  = parseFloat(tempoEl.value || "1", 10);

    if (!idea) {
      log("Fel: skriv in en idé.");
      return;
    }

    providerEl.textContent = "-";
    modelEl.textContent = "-";
    storyEl.textContent = "";
    outEl.textContent = "(tomt)";
    setStatus("Genererar…");
    setBusy(true);
    ttsReady = false;
    lastText = "";
    lastAudioB64 = "";
    resetAudio();

    // Skicka till backend
    try {
      const payload = { idea, level, minutes, tempo };
      const { ok, status, json, raw, parseError } = await fetchJSON(`${BASE}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!ok) {
        log(`Fel vid generering: HTTP ${status}`);
        if (parseError) log(`Parse-fel: ${parseError.message}`);
        setStatus("Fel vid generering.");
        setBusy(false);
        return;
      }

      // Visar provider/modell (om backend satte dem)
      if (json.provider) providerEl.textContent = json.provider;
      if (json.model) modelEl.textContent = json.model;

      // text från backend
      const text = String(json.text || "");
      lastText = text;
      storyEl.textContent = text;

      // TTS ska endast triggas om vi fått ett "komplett" slut.
      if (!hasEndMarker(text)) {
        log("Varning: ingen [SLUT]-tagg hittades—TTS avvaktas.");
        setStatus("Generering klar (ingen [SLUT]).");
        setBusy(false);
        return;
      }

      // Hämta röst ett (1) varv
      setStatus("Hämtar röst…");
      const ttsBody = {
        text: text.replace(/\[SLUT\]/gi, "").trim(),
        voice: voiceEl.value || "alloy",
      };
      const tts = await fetchJSON(`${BASE}/api/tts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ttsBody),
      });

      if (!tts.ok || !tts.json?.ok || !tts.json?.audio) {
        log(`TTS-fel: ${JSON.stringify(tts.json || { raw: tts.raw })}`);
        setStatus("TTS-fel.");
        setBusy(false);
        ttsReady = false;
        return;
      }

      lastAudioB64 = tts.json.audio;
      ttsReady = true;
      setStatus("Klar—tryck Lyssna.");
      setBusy(false);

    } catch (err) {
      log("Fel: " + (err?.message || String(err)));
      setStatus("Fel.");
      setBusy(false);
    }
  }

  // -------------------------------
  // PLAY TTS (ett försök, inga rekursioner)
  // -------------------------------
  listenBtn.addEventListener("click", tryPlayOnce);

  async function tryPlayOnce() {
    if (!ttsReady) {
      log("Ingen röst laddad ännu.");
      return;
    }
    if (playInFlight) return;
    playInFlight = true;

    try {
      // sätt src
      resetAudio();
      audioEl.src = `data:audio/mp3;base64,${lastAudioB64}`;

      // Autoplay/iOS: kräver användargest — detta är redan en knapptryckning
      // så vi provar rakt av och fångar ev. fel
      const p = audioEl.play();
      if (p && typeof p.then === "function") {
        await p;
      }
      hasPlayedOnce = true;
      log("Spelar…");
    } catch (err) {
      // Om iOS säger att det krävs extra klick, skriv tydligt men försök inte igen automatiskt
      log("TTS: kunde inte starta (kräver troligen extra klick/gesture).");
    } finally {
      playInFlight = false;
    }
  }

  // Init-status
  setStatus("");
  log("BN front v1.3.3 inläst.");
})();
