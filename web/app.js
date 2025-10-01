// web/app.js
const $ = id => document.getElementById(id);
const log = (t) => {
  const el = $('log'); el.textContent += `[${new Date().toLocaleTimeString()}] ${t}\n`; el.scrollTop = el.scrollHeight;
};

async function statusPing() {
  try {
    const res = await fetch('/api/v1/status');
    const j = await res.json();
    log('STATUS: ' + JSON.stringify(j));
    return j;
  } catch (e) { log('Status-fel: ' + e.message); return null; }
}

let spinnerInterval = null;
function startSpinner() {
  $('spinner').style.display = 'inline';
  let dots = 0;
  spinnerInterval = setInterval(()=> {
    dots = (dots+1)%4;
    $('dots').textContent = '.'.repeat(dots);
  }, 400);
}
function stopSpinner() {
  if (spinnerInterval) clearInterval(spinnerInterval);
  spinnerInterval = null;
  $('spinner').style.display = 'none';
  $('dots').textContent = '...';
}

async function generate() {
  const btn = $('go');
  btn.disabled = true;
  startSpinner();
  $('result').textContent = '';

  const prompt = $('prompt').value.trim();
  if (!prompt) { alert('Skriv en prompt först'); stopSpinner(); btn.disabled = false; return; }

  const payload = { prompt, lvl: parseInt($('lvl').value), minutes: parseInt($('mins').value), lang: $('lang').value };

  try {
    log('Skickar POST -> /api/v1/episodes/generate (' + JSON.stringify({lvl:payload.lvl, minutes:payload.minutes, lang:payload.lang}) + ')');
    const res = await fetch('/api/v1/episodes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await res.json();
    if (!j.ok) {
      log('RESP ERROR: ' + JSON.stringify(j));
      alert('Fel: ' + (j.detail || j.error || 'okänt'));
    } else {
      log('HTTP: ' + res.status + ' OK');
      $('result').textContent = j.text || '(ingen text)';
      log('RESP: ' + JSON.stringify({ok:j.ok, cached:j.cached, r2Key:j.r2Key}));
    }
  } catch (e) {
    log('Generera-fel: ' + e.message);
    alert('Failed to fetch. Se loggen för detaljer.');
  } finally {
    stopSpinner();
    btn.disabled = false;
  }
}

// wire up
window.addEventListener('DOMContentLoaded', () => {
  $('status').addEventListener('click', statusPing);
  $('go').addEventListener('click', generate);
  // auto status ping
  statusPing();
});
