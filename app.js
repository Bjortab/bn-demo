// app.js
import { OPENAI_API_KEY } from "./config.js";

// Funktion för att anropa backend och generera text
async function generateStory(prompt, level) {
  if (!OPENAI_API_KEY) {
    throw new Error("Ingen API-nyckel hittades. Sätt den i konsolen med localStorage.setItem('OPENAI_API_KEY', 'din-nyckel')");
  }

  try {
    const response = await fetch("/.netlify/functions/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({ prompt, level })
    });

    if (!response.ok) {
      throw new Error(`Fel från servern: ${response.status}`);
    }

    const data = await response.json();
    return data.story || "Ingen berättelse genererades.";
  } catch (error) {
    console.error("Fel vid generering:", error);
    return `Ett fel uppstod: ${error.message}`;
  }
}

// Funktion för att spela upp TTS
async function playTTS(text) {
  if (!OPENAI_API_KEY) {
    alert("Ingen API-nyckel hittades. Sätt den först.");
    return;
  }

  try {
    const response = await fetch("/.netlify/functions/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(`Fel vid TTS: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBlob = new Blob([arrayBuffer], { type: "audio/mpeg" });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.play();
  } catch (error) {
    console.error("Fel vid uppläsning:", error);
    alert("Kunde inte spela upp ljud: " + error.message);
  }
}

// Koppla knapparna till funktionerna
document.getElementById("generateBtn").addEventListener("click", async () => {
  const input = document.getElementById("userInput").value;
  const level = document.querySelector("input[name='level']:checked")?.value || 3;

  const story = await generateStory(input, level);
  document.getElementById("storyOutput").textContent = story;
});

document.getElementById("playBtn").addEventListener("click", () => {
  const story = document.getElementById("storyOutput").textContent;
  if (story) {
    playTTS(story);
  } else {
    alert("Ingen berättelse att läsa upp.");
  }
});
