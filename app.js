// app.js – frontend-logik för BN

document.addEventListener("DOMContentLoaded", () => {
  const ideaInput = document.getElementById("idea");
  const levelSelect = document.getElementById("level");
  const minutesSelect = document.getElementById("minutes");
  const createBtn = document.getElementById("createBtn");
  const output = document.getElementById("output");

  if (!ideaInput || !levelSelect || !minutesSelect || !createBtn || !output) {
    console.error("❌ app.js: Kunde inte hitta alla UI-element.");
    return;
  }

  createBtn.addEventListener("click", async () => {
    const idea = ideaInput.value.trim();
    const level = parseInt(levelSelect.value, 10);
    const minutes = parseInt(minutesSelect.value, 10);

    if (!idea) {
      output.textContent = "⚠️ Ange en idé först!";
      return;
    }

    // Läs senaste “used”-fraser från localStorage
    const lastUsed = JSON.parse(localStorage.getItem("bn_used") || "[]");

    output.textContent = "⏳ Skapar berättelse...";

    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idea,
          level,
          minutes,
          exclude: lastUsed.slice(-60) // undvik senaste ~60 fraserna
        })
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        console.error("❌ API error:", data);
        output.textContent = "Fel från servern. Se konsolen.";
        return;
      }

      // Visa texten
      output.textContent = data.text;

      // Uppdatera anti-upprepningslistan
      const merged = Array.from(new Set(lastUsed.concat(data.used || [])));
      localStorage.setItem("bn_used", JSON.stringify(merged.slice(-200)));

    } catch (err) {
      console.error("❌ Fetch error:", err);
      output.textContent = "Nätverksfel. Försök igen.";
    }
  });
});
