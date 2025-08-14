// ---- State ----
let currentLevel = 1;

// ---- Helpers ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 2400);
}

function openSoon() {
  const d = $('#soonModal');
  if (!d.open) d.showModal();
}
$('#closeSoon').addEventListener('click', () => $('#soonModal').close());

// ---- Nav: smooth scroll + placeholders ----
$$('[data-soon]').forEach((el) => el.addEventListener('click', openSoon));
$$('.topnav .navlink').forEach((a) => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    if (href && href.startsWith('#')) {
      e.preventDefault();
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
      $$('.navlink').forEach((n) => n.classList.remove('active'));
      a.classList.add('active');
    }
  });
});

// ---- Levels ----
$$('.level-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.level-chip').forEach((b) => {
      b.classList.toggle('selected', b === btn);
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });
    currentLevel = Number(btn.dataset.level);
    toast(`Nivå ${currentLevel} vald`);
  });
});

// ---- Volume indicator ----
$('#volume').addEventListener('input', (e) => {
  $('#volOut').textContent = e.target.value;
});

// ---- Create story (simulerad) ----
const ideaEl = $('#idea');
const createBtn = $('#createBtn');
const resultEl = $('#result');

function setLoading(btn, on) {
  btn.classList.toggle('loading', on);
  btn.disabled = on;
}

function fakeGenerateStory(idea, level) {
  // Simulerar ett API-svar — här pluggar vi senare in riktig TTS + AI
  const opening = {
    1: 'Ett mjukt, nyfiket anslag:',
    3: 'En förväntansfull stämning växer:',
    5: 'Pulsen skiftar, närheten blir tydlig:'
  }[level];

  return `${opening}\n\n“${idea.trim()}”\n\n` +
    `— Smakprov nivå ${level}. (AI-uppläsning kopplas in i nästa steg)`;
}

function handleCreate() {
  const idea = ideaEl.value.trim();
  if (!idea) {
    ideaEl.focus();
    toast('Skriv en idé först.');
    return;
  }
  setLoading(createBtn, true);

  // Låt användaren SE att något händer
  resultEl.hidden = false;
  resultEl.textContent = 'Skapar smakprov...';

  // “Fake-latency” för UX — byt till riktig fetch när backend är klar
  setTimeout(() => {
    const text = fakeGenerateStory(idea, currentLevel);
    resultEl.textContent = text;

    // TODO: Lägg TTS här senare (Cloudflare/Edge/Elevenlabs/etc.)
    // t.ex. skapa ett <audio> och sätt src till en genererad URL.

    setLoading(createBtn, false);
    toast('Smakprovet är klart!');
  }, 900);
}

createBtn.addEventListener('click', handleCreate);

// Enter-submit i textarea (Ctrl+Enter eller Cmd+Enter)
ideaEl.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'enter') {
    e.preventDefault();
    handleCreate();
  }
});
