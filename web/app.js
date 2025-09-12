<script>
(() => {
  const API = (document.getElementById('apiBase')?.value || '').trim() ||
              'https://bn-worker.bjorta-bb.workers.dev';
  const btn = document.getElementById('btnRun');
  const stopBtn = document.getElementById('btnStop');
  const playBtn = document.getElementById('btnPlay');
  const levelSel = document.getElementById('level');
  const minSel = document.getElementById('minutes');
  const langSel = document.getElementById('lang');
  const promptEl = document.getElementById('prompt');
  const outText = document.getElementById('story');
  const logEl = document.getElementById('log');
  const audio = document.getElementById('player');

  let busy = false;
  let lastAudioUrl = null;

  function log(s) {
    const t = new Date().toLocaleTimeString();
    logEl.textContent += `[${t}] ${s}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  async function status() {
    const r = await fetch(`${API}/api/v1/status`);
    const j = await r.json();
    log(`Status: ${JSON.stringify(j)}`);
    return j;
  }

  async function run() {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    playBtn.disabled = true;
    stop();

    try {
      const body = {
        prompt: promptEl.value || '',
        level: Number(levelSel.value || 2),
        minutes: Number(minSel.value || 5),
        lang: (langSel.value || 'sv').toLowerCase()
      };

      log(`POST /episodes/generate (${body.minutes} min, nivå ${body.level}, ${body.lang})`);
      const r = await fetch(`${API}/api/v1/episodes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!r.ok) {
        const txt = await r.text().catch(()=>'');
        throw new Error(`HTTP ${r.status} – ${txt.slice(0,200)}`);
      }

      const j = await r.json();
      outText.textContent = j.text || '';
      if (j?.audio?.base64) {
        const src = `data:${j.audio.mime};base64,${j.audio.base64}`;
        lastAudioUrl = src;
        audio.src = src;
        playBtn.disabled = false;
        playBtn.textContent = "Spela upp (klar)";
      } else {
        lastAudioUrl = null;
        audio.removeAttribute('src');
        playBtn.disabled = true;
        log('Ingen audio returnerades (TTS av eller fel).');
      }
    } catch (e) {
      alert(`Fel: ${e.message}`);
      log(`Fel: ${e.message}`);
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }

  function play() {
    if (!lastAudioUrl) return;
    audio.play().catch(e => log(`Audio play error: ${e.message}`));
  }

  function stop() {
    try { audio.pause(); } catch {}
    audio.currentTime = 0;
  }

  // Bind EN gång
  if (!btn.dataset.bound) {
    btn.addEventListener('click', run);
    btn.dataset.bound = '1';
  }
  if (!playBtn.dataset.bound) {
    playBtn.addEventListener('click', play);
    playBtn.dataset.bound = '1';
  }
  if (!stopBtn.dataset.bound) {
    stopBtn.addEventListener('click', stop);
    stopBtn.dataset.bound = '1';
  }

  // Visa status vid start
  status().catch(()=>{});
})();
</script>
