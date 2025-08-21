/* Frivillig fallback. Lämna tomt i repo, eller lägg en dummy.
   Appen använder i första hand localStorage('OPENAI_API_KEY'). */
window.OPENAI_API_KEY = window.OPENAI_API_KEY || "";
// Du kan även sätta defaultmodell/röst här om du vill:
window.BN_DEFAULTS = {
  ttsModel: "gpt-4o-mini-tts",
  textModel: "gpt-4o-mini",
  voice: "alloy"
};
