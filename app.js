// app.js – frontend

const els = {
  length: document.getElementById("length"),
  level: document.getElementById("level"),
  voice: document.getElementById("voice"),
  speed: document.getElementById("speed"),
  idea: document.getElementById("idea"),
  btn: document.getElementById("generateBtn"),
  btnDl: document.getElementById("downloadTxtBtn"),
  player: document.getElementById("audioPlayer"),
  story: document.getElementById("storyText"),
};

const AVOID_KEY = "bn_avoid_phrases_v1";
function getAvoid() {
  try { return JSON.parse(localStorage.getItem(AVOID_KEY) || "[]"); }
  catch { return []; }
}
function pushAvoid(phrases) {
  const cur = getAvoid();
  const next = [...phrases, ...cur].slice(0, 40);
  localStorage.setItem(AVOID_KEY, JSON.stringify(next));
}

els.btn.addEventListener("click", async () => {
  const payload = {
    length: els.length.value,
    level: els.level.value,
    idea: els.idea.value,
    avoid: getAvoid()
  };

  els.btn.disabled = true;
  els.btn.textContent = "Skapar...";
  els.story.textContent = "";
  els.btnDl.disabled = true;
  els.player.removeAttribute("src");

  try {
    // 1) Skapa text
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    const js = await res.json();
    if (!res.ok || !js.ok) throw new Error(js.error || "generate_failed");

    const story = js.story || "";
    els.story.textContent = story;

    // Ladda ner .txt
    els.btnDl.disabled = false;
    els.btnDl.onclick = () => {
      const blob = new Blob([story], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "berattelse.txt"; a.click();
      URL.revokeObjectURL(url);
    };

    // Undvik upprepningar nästa gång
    if (Array.isArray(js.used_phrases)) pushAvoid(js.used_phrases);

    // 2) TTS
    const ttsRes = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        text: story,
        voice: els.voice.value,
      })
    });
    if (!ttsRes.ok) throw new Error("tts_failed");

    const audioBlob = await ttsRes.blob();
    const url = URL.createObjectURL(audioBlob);
    els.player.src = url;

    // VIKTIGT: använd vald hastighet i uppspelningen
    const rate = parseFloat(els.speed.value) || 1.0;
    els.player.playbackRate = rate;

    await els.player.play();

  } catch (e) {
    alert("Fel: " + e.message);
    console.error(e);
  } finally {
    els.btn.disabled = false;
    els.btn.textContent = "Skapa & läs";
  }
});
