// public/app.js
const BASE = window.location.origin;

document.addEventListener("DOMContentLoaded", () => {
  const ideaInput = document.getElementById("idea");
  const levelInput = document.getElementById("level");
  const minutesInput = document.getElementById("minutes");
  const generateBtn = document.getElementById("generate");
  const storyBox = document.getElementById("story");
  const listenBtn = document.getElementById("listen");

  let lastStory = "";
  let currentAudio = null;

  async function generateStory() {
    const idea = ideaInput.value.trim();
    const level = levelInput.value;
    const minutes = parseInt(minutesInput.value, 10);

    storyBox.textContent = "Genererar berättelse...";
    lastStory = "";

    try {
      if (minutes <= 5) {
        // 🔹 Kort berättelse → generate.js
        const res = await fetch(`${BASE}/api/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idea, level, minutes }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error("Fel vid generering (kort)");
        lastStory = data.story;
      } else {
        // 🔹 Lång berättelse → generate-part.js i loop
        let storyParts = [];
        let prevTail = "";
        const totalParts = Math.ceil(minutes / 3); // varje del ≈3 min
        for (let i = 0; i < totalParts; i++) {
          storyBox.textContent = `Genererar del ${i + 1} av ${totalParts}...`;
          const res = await fetch(`${BASE}/api/generate-part`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              idea,
              level,
              minutes,
              partIndex: i,
              totalParts,
              prevTail,
            }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(`Fel vid del ${i + 1}: ${data.error || "okänt"}`);
          storyParts.push(data.storyPart);
          prevTail = data.storyPart.split(" ").slice(-20).join(" "); // spara sista 20 ord för flyt
        }
        lastStory = storyParts.join(" ");
      }

      storyBox.textContent = lastStory || "(Tom berättelse)";
    } catch (err) {
      storyBox.textContent = `Fel: ${err.message}`;
    }
  }

  async function speakStory() {
    if (!lastStory) return alert("Ingen berättelse att läsa upp!");
    storyBox.textContent = "Hämtar röst...";
    try {
      const res = await fetch(`${BASE}/api/tts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: lastStory }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error("TTS misslyckades");

      if (currentAudio) currentAudio.pause();
      currentAudio = new Audio(`data:audio/mp3;base64,${data.audio}`);
      currentAudio.play();
      storyBox.textContent = lastStory;
    } catch (err) {
      storyBox.textContent = `TTS fel: ${err.message}`;
    }
  }

  generateBtn.addEventListener("click", generateStory);
  listenBtn.addEventListener("click", speakStory);
});
