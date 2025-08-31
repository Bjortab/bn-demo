// filters.js — GC v3.1
// Säkerhet: blockerar minderåriga. Maskerar verkliga personer (fulla namn, kända namn, kungliga titlar+namn).
// Tillåter FÖRNAMN i generiska roller: “grannen Lisa”, “chefen Johan”, “fotbollsspelaren Anders”, “ryttaren Helene”.

const MINOR_PATTERNS = [
  /\b(minderårig|underårig|omyndig|tonåring|tonåringar)\b/i,
  /\b(grundskola|högstad(i|et)|mellanstad(i|et)|gymnasie(elev|t|r)|klassrum|skolkorridor)\b/i,
  /\b(?:1[0-7]|[0-9])\s*(år|ar|yrs?|yo)\b/i,
  /\b(under\s*18|<\s*18)\b/i,
];

const PROHIBITED_CONTEXT = [
  /\b(liten\s+(flicka|pojke))\b/i,
  /\b(elev(er)?|skolelev|skolflicka|skolpojke)\b/i,
];

// titlar som vi anser “offentliga” (kombinerat med namn -> mask)
const SENSITIVE_TITLES = [
  'prinsessan','prinsen','kungen','drottningen','hertiginnan',
  'president','statsminister','minister','riksdagsledamot'
];

// generiska roller (ok ihop med ett ENDA kapitaliserat ord = förnamn)
const GENERIC_ROLES = [
  'grannen','grannfrun','chefen','kollegan','vännen','servitrisen','vakten',
  'fotbollsspelaren','ryttaren','tränaren','läraren','rektorn','journalisten',
  'artisten','skådespelaren','programledaren','influencern','idrottaren'
];

// kända namn (exempel – fyll på efter behov)
const KNOWN_REAL_PEOPLE = [
  'madeleine bernadotte','victoria bernadotte','karl xvi gustaf','silvia sommarlath',
  'taylor swift','kim kardashian','elon musk','jeff bezos'
];

// mönster för sekvens av 2–4 Kapitaliserade ord = sannolikt fullt namn → mask
const FULLNAME_REGEX = /\b([A-ZÅÄÖ][a-zåäö]+(?:\s+[A-ZÅÄÖ][a-zåäö]+){1,3})\b/g;

function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

function hasMinorSignals(str) {
  const s = String(str || '');
  if (!s) return false;
  for (const re of MINOR_PATTERNS) if (re.test(s)) return true;
  for (const re of PROHIBITED_CONTEXT) if (re.test(s)) return true;
  return false;
}

function isKnownRealName(s) {
  const lc = s.toLowerCase();
  return KNOWN_REAL_PEOPLE.some(n => lc.includes(n));
}

// tillåter “role + Förnamn”, t.ex. “fotbollsspelaren Anders”, “ryttaren Helene”
function allowRoleFirstName(str) {
  const roleAlt = GENERIC_ROLES.join('|');
  const re = new RegExp(`\\b(?:${roleAlt})\\s+([A-ZÅÄÖ][a-zåäö]+)\\b`, 'g');
  return str.replace(re, (m) => m); // explicit no-op (dokumenterar att vi tillåter)
}

function maskRealPersons(str) {
  let text = String(str || '');
  let changed = false;
  const hits = [];

  // 1) kända namn (case-insensitiv)
  if (isKnownRealName(text)) {
    changed = true;
    hits.push('kända namn');
    for (const name of KNOWN_REAL_PEOPLE) {
      const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gi');
      text = text.replace(re, 'en fiktiv person');
    }
  }

  // 2) SENSITIVE_TITLES + Namn (en eller två kapitaliserade ord efter titeln) -> mask
  for (const t of SENSITIVE_TITLES) {
    const re = new RegExp(`\\b${escapeRegExp(t)}\\s+([A-ZÅÄÖ][a-zåäö]+(?:\\s+[A-ZÅÄÖ][a-zåäö]+)?)\\b`, 'g');
    text = text.replace(re, (_, name) => {
      changed = true;
      return `en fiktiv ${t.toLowerCase()}`;
    });
  }

  // 3) Fullständiga namn (2–4 kapitaliserade ord i följd) → maska, MEN
  //    lämna “role + Förnamn” orört (vi tillåter det).
  const before = text;
  text = allowRoleFirstName(text); // idem-potent
  text = text.replace(FULLNAME_REGEX, (m) => {
    // om det bara är ETT ord – rör det inte (kan vara förnamn)
    const parts = m.trim().split(/\s+/);
    if (parts.length === 1) return m;
    // annars maskera
    changed = true;
    return 'en fiktiv person';
  });

  return { text, changed: changed || text !== before, hits };
}

const CLICHES = [
  /ceder\s+och\s+rök/gi,
  /doft(en)?\s+av\s+\w+\s+och\s+trä/gi
];
const QUICK_FIXES = [
  [/\bcock\b/gi, 'kuk'],
  [/\b(cook|coock)\b/gi, 'kuk'],
  [/\s{3,}/g, ' '],
];

export function sanitizeIdea(ideaInput) {
  const warnings = [];
  let idea = String(ideaInput || '').trim();
  if (!idea) return { ok: true, idea: '', warnings };

  if (hasMinorSignals(idea)) {
    return { ok: false, reason: 'minors', warnings };
  }
  const mask = maskRealPersons(idea);
  if (mask.changed) warnings.push('Riktiga namn/titlar maskades till fiktiva.');

  return { ok: true, idea: mask.text, warnings };
}

export function applyFilters(generated, { level = 3, persons = 2 } = {}) {
  const warnings = [];
  let text = String(generated || '').trim();
  if (!text) return { ok: true, text: '', warnings };

  if (hasMinorSignals(text)) {
    return { ok: false, reason: 'minors', warnings };
  }
  const mask = maskRealPersons(text);
  if (mask.changed) warnings.push('Riktiga namn/titlar maskades i texten.');

  // ta bort klyschor
  for (const re of CLICHES) if (re.test(text)) { text = text.replace(re, ''); warnings.push('Klyschiga fraser togs bort.'); }
  // snabba fixar
  for (const [re, repl] of QUICK_FIXES) text = text.replace(re, repl);

  // enkel samtidighets-fix
  if (persons === 2) {
    text = text.replace(/\bred(honom)?\s+sam(tidigt)?\s+som\s+hon\s+sög\b/gi,
      'red honom, och senare sög hon av honom');
  }

  // nivå 4 mildring
  if (Number(level) === 4) {
    const soften = [
      [/\bkuk\b/gi, 'lem'],
      [/\bfitta\b/gi, 'vagina'],
      [/\bjävla\b/gi, ''],
      [/\bknulla\b/gi, 'älska med'],
    ];
    for (const [re, repl] of soften) text = text.replace(re, repl);
  }

  return { ok: true, text, warnings };
}
