const generateBtn = document.getElementById("generateStoryBtn");
const storyOutput = document.getElementById("storyOutput");
const playBtn = document.getElementById("playAudioBtn");
const backBtn = document.getElementById("backToMain");
const navButtons = document.querySelectorAll(".bottom-nav button");
const sections = document.querySelectorAll("main section");

let selectedLevel = 1;
let generatedStory = "";

// Välj nivå
document.querySelectorAll(".level-buttons button").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedLevel = btn.getAttribute("data-level");
    alert(`Du valde nivå ${selectedLevel}`);
  });
});

// Generera berättelse
generateBtn.addEventListener("click", async () => {
  const userInput = document.getElementById("userPrompt").value || "Överraska mig!";
  
  if (OFFLINE_MODE) {
    // Dummy-text
    generatedStory = `✨ (Nivå ${selectedLevel}) Här skulle en AI-berättelse komma om "${userInput}". Detta är simulerat offline-läge.`;
    storyOutput.textContent = generatedStory;
  } else {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Du är en sensuell berättarröst." },
            { role: "user", content: `Skriv en erotisk novell nivå ${selectedLevel}: ${userInput}` }
          ],
          max_tokens: 400
        })
      });

      const data = await response.json();
      generatedStory = data.choices[0].message.content;
      storyOutput.textContent = generatedStory;
    } catch (err) {
      storyOutput.textContent = "Fel: Kunde inte hämta berättelse.";
    }
  }
});

// Spela upp berättelse (simulerat ljud i offline)
playBtn.addEventListener("click", () => {
  if (!generatedStory) {
    alert("Generera en berättelse först!");
    return;
  }
  if (OFFLINE_MODE) {
    alert("🔊 Offline-läge: här skulle berättelsen läsas upp.");
  } else {
    alert("🔊 Ljud via OpenAI TTS (ej implementerat ännu).");
  }
});

// Navigering
navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-target");
    sections.forEach(sec => sec.style.display = "none");
    document.getElementById(target).style.display = "block";
  });
});

// Tillbaka-knapp i BlushConnect
backBtn.addEventListener("click", () => {
  sections.forEach(sec => sec.style.display = "none");
  document.getElementById("story-generator").style.display = "block";
});

// Init – visa bara första sektionen
sections.forEach(sec => sec.style.display = "none");
document.getElementById("story-generator").style.display = "block";
