// app.js — Golden copy v1.2 (knapplogik + robust bindning)

(() => {
  const $ = (q) => document.querySelector(q);

  // UI-element (säkra selektorer)
  const elLevel   = $('#level');
  const elLength  = $('#length');
  const elVoice   = $('#voice');
  const elTempo   = $('#tempo');
  const elIdea    = $('#userIdea');
  const btnGen    = $('#generateBtn');
  const btnPlay   = $('#listenBtn');
  const btnStop   = $('#stopBtn');
  const elOut     = $('#output');

  // API-basar
  const BASE = location.origin + '/api';

  // Tillstånd
  let currentAudio = null;
  let busy = false;

  // ===== Hjälpare

  const setBusy = (v) => {
    busy = v;
    [btnGen, btnPlay, btnStop].forEach(b => { if (b) b.disabled = v; });
  };

  const json = async (res) => {
    try { return await res.json(); }
    catch { return { ok:false, error:'Ogiltig JSON', raw: await res.text().catch(()=>null) }; }
  };

  const toast = (msg) => {
    console.log('[BN]', msg);
    // här kan vi ersätta med snackbar om du vill
    // alert(msg) är för invasiv – vi undviker det i produktion
  };

  const checkHealth = async () => {
    try {
      const res = await fetch(BASE + '/health', { headers: { 'accept':'application/json' }});
      const data = await json(res);
      const ok = res.ok && data && (data.ok === true);
      if (ok) {
        const tag = document.createElement('small');
        tag.textContent = 'API: ok';
        tag.style.opacity = '0.7';
        document.body.insertBefore(tag, document.body.firstChild);
      } else {
        toast('API ej redo – fallback används');
      }
      return ok;
    } catch (e) {
      toast('API-koll misslyckades – fallback används');
      return false;
    }
  };

  const getInputs = () => {
    const level  = Number(elLevel?.value || 1);
    const minutes = Number((document.querySelector('input[name="length"]:checked')?.value) || elLength?.value || 1);
    const voice  = elVoice?.value || 'Alloy';
    const tempo  = Number(elTempo?.value || 1.0);
    const idea   = (elIdea?.value || '').trim();
    return { level, minutes, voice, tempo, idea };
  };

  const renderStory = (txt) => {
    if (!elOut) return;
    elOut.textContent = txt || '(tomt)';
  };

  // ===== Knappar

  const onGenerate = async () => {
    if (busy) return;
    setBusy(true);
    renderStory('(skriver…)');

    const okHealth = await checkHealth();
    const { level, minutes, idea } = getInputs();

    try {
      const res = await fetch(BASE + '/generate', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ level, minutes, idea })
      });
      const data = await json(res);
      if (!res.ok || !data.ok) {
        renderStory('(kunde inte generera – prova igen)');
        toast(data.error || `Fel ${res.status}`);
        return;
      }
      // Kontrakt: { ok:true, story:"..." }
      renderStory(data.story || '(tomt)');
    } catch (e) {
      renderStory('(fel vid generering)');
      toast(e.message || 'Nätverksfel');
    } finally {
      setBusy(false);
    }
  };

  const onPlay = async () => {
    if (busy) return;
    const text = (elOut?.textContent || '').trim();
    if (!text) { toast('Ingen text att läsa'); return; }

    // Avbryt tidigare ljud
    try { currentAudio?.pause(); } catch {}
    currentAudio = null;

    setBusy(true);
    const { voice, tempo } = getInputs();

    try {
      const res = await fetch(BASE + '/tts', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ text, voice, speed: tempo })
      });
      const data = await json(res);
      if (!res.ok || !data.ok || !data.url) {
        toast(data.error || `TTS fel ${res.status}`);
        return;
      }
      const au = new Audio(data.url);
      currentAudio = au;
      au.onended = () => { /* klar */ };
      await au.play();
    } catch (e) {
      toast(e.message || 'Audio-fel');
    } finally {
      setBusy(false);
    }
  };

  const onStop = () => {
    try { currentAudio?.pause(); } catch {}
    currentAudio = null;
  };

  // ===== Idempotent bindning

  // vi markerar knappar vi kopplat till för att tåla re-bind
  const ensureClick = (el, fn) => {
    if (!el || typeof fn !== 'function') return;
    const mark = '__bn_bound__';
    if (el[mark]) return;
    el.addEventListener('click', fn);
    el[mark] = true;
  };

  const bindUI = () => {
    ensureClick(btnGen, onGenerate);
    ensureClick(btnPlay, onPlay);
    ensureClick(btnStop, onStop);
  };

  // Robust init: körs vid DOMContentLoaded + om sidan blir synlig igen.
  const init = () => {
    bindUI();
    // minimal smoke: varna om element saknas
    const missing = [
      ['#generateBtn', btnGen],
      ['#listenBtn', btnPlay],
      ['#stopBtn', btnStop],
      ['#output', elOut],
    ].filter(([_, el]) => !el).map(([sel]) => sel);
    if (missing.length) {
      console.warn('BN UI saknar:', missing.join(', '));
    }
  };

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) bindUI();
  });

  // Rescue-krok i konsolen om du behöver re-binda manuellt:
  //   window.BN_rescue()
  window.BN_rescue = () => { bindUI(); return 'Rescue ok (knappar bundna)'; };
})();
