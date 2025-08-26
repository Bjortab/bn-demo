// Enkel demo-version
document.addEventListener("DOMContentLoaded", () => {
  const generateBtn = document.getElementById("generateBtn");
  const listenBtn = document.getElementById("listenBtn");
  const stopBtn = document.getElementById("stopBtn");
  const output = document.getElementById("output");
  const userIdea = document.getElementById("userIdea");

  // Generera text (just nu placeholder tills API-nyckel är kopplad)
  generateBtn.addEventListener("click", () => {
    const idea = userIdea.value.trim() || "En kort berättelse om närhet...";
    output.textContent = `Berättelse: ${idea}`;
  });

  // Lyssna på text (Web Speech API för fallback)
  let utterance;
  listenBtn.addEventListener("click", () => {
    if (!output.textContent) {
      output.textContent = "Generera en berättelse först.";
      return;
    }
    utterance = new SpeechSynthesisUtterance(output.textContent);
    speechSynthesis.speak(utterance);
  });

  // Stoppa uppläsning
  stopBtn.addEventListener("click", () => {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
  });
});
