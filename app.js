/* BN demo – helt client-side.
   Funktioner:
   - nivå 1/3/5
   - generera kort text lokalt
   - TTS via Web Speech API (om tillgängligt)
   - favoriter i localStorage
   - enkel profil + BlushConnect inställningar
*/

const state = {
  level: parseInt(localStorage.getItem('bn.level') || '1', 10),
  ttsOk: 'speechSynthesis' in window,
  currentStory: null,
};

const els = {
  tabs: document.querySelectorAll('.tab'),
  views: {
    home: document.getElementById('tab-home'),
    favs: document.getElementById('tab-favs'),
    profile: document.getElementById('tab-profile'),
  },
  levels: document.querySelectorAll('.level'),
  levelChip: document.getElementById('levelChip'),
  idea: document.getElementById('idea'),
  btnCompose: document.getElementById('btnCompose'),
  storyCard: document.getElementById('storyCard'),
  storyTitle: document.getElementById('storyTitle'),
  storyText: document.getElementById('storyText'),
  btnPlay: document.getElementById('btnPlay'),
  btnStop: document.getElementById('btnStop'),
  btnFav: document.getElementById('btnFav'),
  favsList: document.getElementById('favsList'),
  btnIntro: document.getElementById('btnIntro'),
  ttsStatus: document.getElementById('ttsStatus'),
  // profile
  displayName: document.getElementById('displayName'),
  defaultLevel: document.getElementById('defaultLevel'),
  btnSaveProfile: document.getElementById('btnSaveProfile'),
  // connect
  btnConnect: document.getElementById('btnConnect'),
  dlgConnect: document.getElementById('connectDlg'),
  connectLevel: document.getElementById('connectLevel'),
  connectCity: document.getElementById('connectCity'),
  btnSaveConnect: document.getElementById('btnSaveConnect'),
};

// ============ NAV
els.tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    els.tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    els.views[tab].classList.add('active');
    if (tab === 'favs') renderFavs();
  });
});

// ============ NIVÅ
function syncLevelUI(){
  els.levels.forEach(b=>{
    b.classList.toggle('active', parseInt(b.dataset.level,10) === state.level);
  });
  els.levelChip.textContent = `Nivå ${state.level}`;
}
els.levels.forEach(b=>{
  b.addEventListener('click', ()=>{
    state.level = parseInt(b.dataset.level,10);
    localStorage.setItem('bn.level', String(state.level));
    syncLevelUI();
  });
});
syncLevelUI();

// ============ INTRO (TTS)
function speak(text){
  if(!state.ttsOk) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'sv-SE';
  u.rate = 1.02;
  u.pitch = 1.0;
  window.speechSynthesis.speak(u);
}

function introText(){
  switch(state.level){
    case 1: return "Välkommen till Blush Narratives. Nivå ett är lätt och oskyldig, med värme och romantik.";
    case 3: return "Välkommen till Blush Narratives. Nivå tre bjuder på flörtig stämning och mer detaljer.";
    case 5: return "Välkommen till Blush Narratives. Nivå fem är mest uttrycksfull, med tydliga, vuxna detaljer.";
  }
}
els.btnIntro.addEventListener('click', ()=>{
  if(!state.ttsOk){
    els.ttsStatus.textContent = "TTS saknas i webbläsaren – text läses inte upp.";
    return;
  }
  els.ttsStatus.textContent = "";
  speak(introText());
});

// ============ GENERERA TEXT (lokal demo)
function generateStory(idea, level){
  const base = idea && idea.trim().length ? idea.trim() : "En oväntad kväll";
  const tones = {
    1: ["varma blickar", "lätta beröringar", "romantisk ton"],
    3: ["pirrig nyfikenhet", "långsamma andetag", "förväntansfull stämning"],
    5: ["otålig lust", "handfasta rörelser", "nakna erkännanden"]
  };
  const tone = tones[level];
  const para1 = `${base}. I skymningen möttes ni, där ${tone[0]} sa mer än ord.`;
  const para2 = `Rummet fylldes av ${tone[1]}, och ni vågade stanna upp, nära.`;
  const para3 = `Med ${tone[2]} närvarande, tog kvällen sin egen riktning.`;
  const text = [para1, para2, para3].join(" ");
  return {
    title: `${base} — nivå ${level}`,
    text
  };
}

els.btnCompose.addEventListener('click', ()=>{
  const idea = els.idea.value;
  const story = generateStory(idea, state.level);
  state.currentStory = story;
  els.storyTitle.textContent = story.title;
  els.storyText.textContent = story.text;
  els.storyCard.classList.remove('hidden');
  // auto-read om TTS finns
  if(state.ttsOk) speak(story.text);
});

els.btnPlay.addEventListener('click', ()=>{
  if(!state.currentStory) return;
  if(state.ttsOk) speak(state.currentStory.text);
});
els.btnStop.addEventListener('click', ()=>{
  if(state.ttsOk) window.speechSynthesis.cancel();
});

// ============ FAVORITER (localStorage)
function getFavs(){
  try{
    return JSON.parse(localStorage.getItem('bn.favs') || '[]');
  }catch{ return []; }
}
function setFavs(list){
  localStorage.setItem('bn.favs', JSON.stringify(list));
}
els.btnFav.addEventListener('click', ()=>{
  if(!state.currentStory) return;
  const list = getFavs();
  list.unshift({
    id: Date.now(),
    level: state.level,
    title: state.currentStory.title,
    text: state.currentStory.text
  });
  setFavs(list);
  els.btnFav.textContent = "Sparad ✓";
  setTimeout(()=> els.btnFav.textContent = "Spara i favoriter", 1200);
});
function renderFavs(){
  const list = getFavs();
  const box = els.favsList;
  box.innerHTML = "";
  if(list.length === 0){
    box.classList.add('empty');
    box.innerHTML = `<p class="muted">Inga favoriter ännu.</p>`;
    return;
  }
  box.classList.remove('empty');
  list.forEach(item=>{
    const row = document.createElement('div');
    row.className = 'fav';
    row.innerHTML = `
      <h4>${item.title}</h4>
      <p class="muted small" style="margin:.2rem 0 .6rem">Nivå ${item.level}</p>
      <p>${item.text}</p>
      <div class="player" style="margin-top:8px">
        <button class="circle play">▶</button>
        <button class="circle del">🗑</button>
      </div>
    `;
    row.querySelector('.play').addEventListener('click', ()=>{
      if(state.ttsOk) speak(item.text);
    });
    row.querySelector('.del').addEventListener('click', ()=>{
      const after = getFavs().filter(f=>f.id !== item.id);
      setFavs(after);
      renderFavs();
    });
    box.appendChild(row);
  });
}

// ============ PROFIL
(function initProfile(){
  els.displayName.value = localStorage.getItem('bn.displayName') || '';
  els.defaultLevel.value = localStorage.getItem('bn.defaultLevel') || String(state.level);
})();
els.btnSaveProfile.addEventListener('click', ()=>{
  localStorage.setItem('bn.displayName', els.displayName.value.trim());
  localStorage.setItem('bn.defaultLevel', els.defaultLevel.value);
  state.level = parseInt(els.defaultLevel.value,10);
  localStorage.setItem('bn.level', String(state.level));
  syncLevelUI();
  alert('Profil sparad.');
});

// ============ BLUSHCONNECT (placeholder)
els.btnConnect.addEventListener('click', ()=>{
  els.connectLevel.value = localStorage.getItem('bn.connect.level') || String(state.level);
  els.connectCity.value = localStorage.getItem('bn.connect.city') || '';
  els.dlgConnect.showModal();
});
els.btnSaveConnect.addEventListener('click', (e)=>{
  e.preventDefault();
  localStorage.setItem('bn.connect.level', els.connectLevel.value);
  localStorage.setItem('bn.connect.city', els.connectCity.value.trim());
  els.dlgConnect.close();
});

// ============ TTS-status
if(!state.ttsOk){
  els.ttsStatus.textContent = "Ingen TTS i webbläsaren – uppläsning hoppas över.";
}
