/* BN front v1.1 – 5/10/15 min & robust UI */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const el = {
  apiOk: $('#apiOk'),
  idea: $('#idea'),
  voice: $('#voice'),
  tempo: $('#tempo'),
  out: $('#output'),
  gen: $('#generateBtn'),
  play: $('#listenBtn'),
  stop: $('#stopBtn'),
};

let currentStory = '';
let currentAudio = null;
let speaking = false;

function getLevel() {
  const r = $$('input[name="level"]:checked')[0];
  return r ? Number(r.value) : 3;
}
function getMinutes() {
  const r = $$('input[name="minutes"]:checked')[0];
  return r ? Number(r.value) : 5;
}

async function checkHealth() {
  try {
    const r = await fetch('/api/health');
    const j = await r.json();
    el.apiOk.textContent = j.ok ? 'API: ok' : 'API: fel';
    el.apiOk.style.background = j.ok ? '#1f2a21' : '#3b1b1b';
  } catch {
    el.apiOk.textContent = 'API: fel';
    el.apiOk.style.background = '#3b1b1b';
  }
}

function lockUI(locked) {
  el.gen.disabled = locked;
  el.play.disabled = locked || !currentStory;
  $$('input[name="level"]').forEach(x => x.disabled = locked);
  $$('input[name="minutes"]').forEach(x => x.disabled = locked);
  el.voice.disabled = locked;
  el.tempo.disabled = locked;
  el.idea.disabled = locked;
}

async function generate() {
  lockUI(true);
  el.out.textContent = '(skapar berättelse …)';
  currentStory = '';

  const body = {
    idea: (el.idea.value || '').trim(),
    level: getLevel(),
    minutes: getMinutes()
  };

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Okänt fel');

    currentStory = data.story || '';
    el.out.textContent = currentStory || '(tomt)';
    el.play.disabled = !currentStory;
  } catch (e) {
    el.out.innerHTML = `<span class="error">Fel: ${e.message}</span>`;
  } finally {
    lockUI(false);
  }
}

async function ttsPlay() {
  if (!currentStory || speaking) return;
  speaking = true;
  el.play.disabled = true;
  el.play.textContent = 'Spelar upp…';

  const body = {
    text: currentStory,
    voice: el.voice.value,
    speed: Number(el.tempo.value)
  };

  try {
    const r = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('TTS error');
    const j = await r.json();
    const audioUrl = j.url;
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    currentAudio = new Audio(audioUrl);
    currentAudio.onended = () => { speaking = false; el.play.textContent = 'Lyssna'; el.play.disabled = false; };
    await currentAudio.play();
  } catch (e) {
    el.out.insertAdjacentHTML('beforeend', `\n\n<span class="error">TTS fel: ${e.message}</span>`);
    speaking = false;
    el.play.textContent = 'Lyssna';
    el.play.disabled = false;
  }
}

function ttsStop() {
  if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; }
  speaking = false;
  el.play.textContent = 'Lyssna';
  el.play.disabled = !currentStory;
}

function safeBind(node, type, fn) {
  if (!node) return;
  node.removeEventListener(type, fn);
  node.addEventListener(type, fn, { passive: true });
}

function init() {
  safeBind(el.gen, 'click', generate);
  safeBind(el.play, 'click', ttsPlay);
  safeBind(el.stop, 'click', ttsStop);
  safeBind(el.tempo, 'input', () => $('.hint').textContent = `${Number(el.tempo.value).toFixed(2)}×`);

  checkHealth();
}
document.addEventListener('DOMContentLoaded', init);
