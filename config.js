// config.js

// Hämta API-nyckel från localStorage om den finns
// Om ingen finns, sätt en tom sträng (så vi kan ge felmeddelande i app.js)
export const OPENAI_API_KEY =
  (typeof localStorage !== "undefined" && localStorage.getItem("OPENAI_API_KEY")) || "";
