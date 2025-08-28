// functions/api/sv-lexicon.js
// Redigerbart lexikon för anti-kliché, ordval och grammatik-fixar.

export const LEX = {
  // Klichéer → ersättningar (regex är case-insensitive)
  banPhrases: [
    { re: /kanel\s+och\s+rök/gi,                     repl: "toner av vanilj och mysk" },
    { re: /en\s+doft\s+av\s+kanel/gi,                repl: "varma inslag av vanilj" },
    { re: /doften\s+av\s+hans\/hennes\s+parfym/gi,   repl: "den diskreta doften som omgav hen" },
    { re: /elektrisk\s+spänning\s+mellan\s+oss/gi,   repl: "den intensiva dragningen mellan oss" },
    { re: /som\s+om\s+tiden\s+stod\s+stilla/gi,     repl: "som om världen tystnade omkring oss" },
  ],

  // Vanliga småfel att rätta
  grammarFixes: [
    { re: /\bmitt\s+handrygg\b/gi, repl: "min handrygg" },
    { re: /\bmitt\s+rygg\b/gi,     repl: "min rygg" },
    { re: /\bmin\s+hand\s+rygg\b/gi, repl: "min handrygg" },
    { re: /\slåg\s+vi\s+oss\b/gi,  repl: "lade vi oss" },
    { re: /\bvisste\s+inte\s+ordet\s+av\b/gi, repl: "innan jag visste ordet av" },
    // Ordval: håll enhetliga vuxna ord
    { re: /\bsköte\b/gi,           repl: "vagina" },
  ],

  // Variation för doftbeskrivningar om du vill rotera slumpmässigt (valfritt)
  perfumeAlternatives: [
    "toner av vanilj och mysk",
    "ceder och mild citrus",
    "ambra och sandelträ",
    "en lätt friskhet av bergamott",
  ],

  // Enkel anti-upprepning (ta bort identiska meningar i följd)
  dedupeSentences: true,

  // Enkel 2–3-ords eko i direkt följd (true = slå på)
  dedupeShortEcho: true,
};
