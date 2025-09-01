// public/app.js – utdrag runt “Generera”-anropet
const form = {
  level: document.querySelector('#level'),
  minutes: document.querySelector('#minutes'),
  voice: document.querySelector('#voice'),
  tempo: document.querySelector('#tempo'),
  idea: document.querySelector('#idea'),
  out: document.querySelector('#out'),        // loggruta
  btnGen: document.querySelector('#btnGen'),
  btnPlay: document.querySelector('#btnPlay'),
};

function append(line) {
  const t = new Date().toTimeString().slice(0,8);
  form.out.textContent += `\n[${t}] ${line}`;
  form.out.scrollTop = form.out.scrollHeight;
}

async function generate() {
  const idea = (form.idea.value || '').trim();
  if (!idea) {
    append('Skriv en idé först.');
    return;
  }
  form.btnGen.disabled = true;
  append('Genererar…');

  const payload = {
    idea,                                  // 👈 skickar "idea"
    level: Number(form.level.value),
    minutes: Number(form.minutes.value),
    voice: form.voice.value,
    tempo: Number(form.tempo.value),
  };

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      append(`Fel vid generering: HTTP ${res.status}`);
      if (err?.error) append(JSON.stringify(err));
      return;
    }

    const data = await res.json();
    if (!data?.ok) {
      append('Fel vid generering: ok=false');
      return;
    }

    // Visa texten i din textyta/scroll (anpassa efter din DOM)
    const storyEl = document.querySelector('#story');
    if (storyEl) storyEl.textContent = data.text;

    append('(klart)');
  } catch (e) {
    append('Nätverksfel vid generering.');
    console.error(e);
  } finally {
    form.btnGen.disabled = false;
  }
}

// koppla knappen
form.btnGen.addEventListener('click', generate);
