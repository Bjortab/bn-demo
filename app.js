// ===== Panelnavigation =====
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    panels.forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.panel).classList.add("active");
  });
});

// ===== Demoartiklar =====
const articles = [
  { title: "En mjuk början", ingress: "En stilla kväll i skenet av stearinljus...", body: "Här skulle hela berättelsen ligga." },
  { title: "Förtrollad blick", ingress: "Hon såg på mig med den där blicken...", body: "Här skulle hela berättelsen ligga." },
  { title: "Vågor av värme", ingress: "Vinden smekte huden när vi stod vid havet...", body: "Här skulle hela berättelsen ligga." }
  // Lägg till fler artiklar här
];

// ===== Flöde (Hem) =====
const cardsContainer = document.getElementById("cards");
const cardTpl = document.getElementById("card-tpl");

function renderCards(list, target) {
  target.innerHTML = "";
  list.forEach(article => {
    const clone = cardTpl.content.cloneNode(true);
    clone.querySelector(".title").textContent = article.title;
    clone.querySelector(".ingress").textContent = article.ingress;
    clone.querySelector(".save").addEventListener("click", () => saveArticle(article));
    clone.querySelector(".listen").addEventListener("click", () => playArticle(article));
    target.appendChild(clone);
  });
}

renderCards(articles, cardsContainer);

// ===== Sparade artiklar =====
let saved = JSON.parse(localStorage.getItem("bn_saved") || "[]");
const savedList = document.getElementById("savedList");

function saveArticle(article) {
  saved.push(article);
  localStorage.setItem("bn_saved", JSON.stringify(saved));
  renderCards(saved, savedList);
}

renderCards(saved, savedList);

// ===== Sökfunktion =====
document.getElementById("doSearch").addEventListener("click", () => {
  const term = document.getElementById("search").value.toLowerCase();
  const results = articles.filter(a => a.title.toLowerCase().includes(term) || a.ingress.toLowerCase().includes(term));
  renderCards(results, document.getElementById("results"));
});

// ===== Modal =====
const modal = document.getElementById("modal");
document.getElementById("closeModal").addEventListener("click", () => modal.close());

function playArticle(article) {
  document.getElementById("modalTitle").textContent = article.title;
  document.getElementById("modalIngress").textContent = article.ingress;
  document.getElementById("modalBody").textContent = article.body;
  modal.showModal();
  playVoice(article.body);
}

// ===== BlushConnect — inställningar =====
const voiceSelect = document.getElementById("voiceSelect");
const intensityInput = document.getElementById("intensity");

// Ladda sparade inställningar
const prefs = JSON.parse(localStorage.getItem("bn_prefs") || "{}");
if (prefs.voice) voiceSelect.value = prefs.voice;
if (prefs.intensity) intensityInput.value = prefs.intensity;

document.getElementById("savePrefs").addEventListener("click", () => {
  localStorage.setItem("bn_prefs", JSON.stringify({
    voice: voiceSelect.value,
    intensity: intensityInput.value
  }));
  alert("Inställningar sparade!");
});

document.getElementById("previewVoice").addEventListener("click", () => {
  playVoice("Detta är en provläsning med din valda röst.");
});

// ===== Röstuppspelning (placeholder) =====
function playVoice(text) {
  // Här kan vi integrera med t.ex. Web Speech API eller en TTS-tjänst
  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "sv-SE";
    utterance.rate = 1;
    utterance.pitch = 1;
    speechSynthesis.speak(utterance);
  } else {
    alert("Din webbläsare stöder inte talsyntes.");
  }
}
