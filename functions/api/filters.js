// functions/api/filters.js — GC v1
export function sanitizeLanguage(raw) {
  let t = raw;
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  t = t
    .replace(/\bhan stog\b/gi, "han stod")
    .replace(/\bstog\b/gi, "stod")
    .replace(/\bdom\b/gi, "de")
    .replace(/\bhans hander\b/gi, "hans händer")
    .replace(/\bhennes hander\b/gi, "hennes händer")
    .replace(/\bbröstvarta\b/gi, "bröstvårta");
  t = t.replace(/ ?["“”]/g, '"').replace(/\s*—\s*/g, " — ");
  if (!/[.!?…]"?\s*$/.test(t)) t += "…";
  return t;
}
export function fixPronunciation(raw, level = 3) {
  let t = raw;
  t = t.replace(/\bcook\b/gi, "kuk");
  t = t.replace(/\bCock\b/gi, "kuk");
  t = t.replace(/\bklit(?:oris)?\b/gi, "klitoris");
  if (level === 3) {
    t = t.replace(/\bfitta\b/gi, "mellan mina ben").replace(/\bkuk\b/gi, "lem");
  }
  return t;
}
export function consistencyFix(raw, persons = 2) {
  let t = raw;
  if (persons === 2) {
    t = t.replace(
      /rider[^.!\n]*suger|suger[^.!\n]*rider/gi,
      (m) => m.replace(/rider|suger/gi, "växlar mellan att rida och suga")
    );
    t = t.replace(
      /bakifrån[^.!\n]*tittar (henne|honom) i ögonen/gi,
      "bakifrån, medan våra blickar möts i spegeln"
    );
  }
  t = t.replace(/\b(vi kysstes|han rörde mig|hon rörde mig)([, ]+)\1\b/gi, "$1 igen");
  return t;
}
export function applyFilters(text, { level = 3, persons = 2 } = {}) {
  let t = text;
  t = consistencyFix(t, persons);
  t = sanitizeLanguage(t);
  t = fixPronunciation(t, level);
  return t;
}
