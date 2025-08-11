const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

// 20 artiklar (10 Guiden + 10 Utforska)
const articles = [
  {id:"g1", category:"Guiden", title:"Kommunikation som faktiskt funkar", ingress:"En enkel modell för svåra samtal: spegla, validera, önska.", body:"Fulltext kommer här. Struktur för exempel och övningar.", tags:["kommunikation","relation"]},
  {id:"g2", category:"Guiden", title:"Samtycke utan krångel", ingress:"Tydligt, ömsesidigt och respektfullt – så blir det bra för båda.", body:"Fulltext placeholder.", tags:["samtycke"]},
  {id:"g3", category:"Guiden", title:"Närhet på riktigt", ingress:"Små vardagliga handlingar som bygger trygghet och attraktion.", body:"Fulltext placeholder.", tags:["närhet"]},
  {id:"g4", category:"Guiden", title:"Eftervård & reflektion", ingress:"Check-in, bekräftelse och återhämtning.", body:"Fulltext placeholder.", tags:["eftervård"]},
  {id:"g5", category:"Guiden", title:"Gränser och önskemål", ingress:"Hur man uttrycker nej, kanske och ja.", body:"Fulltext placeholder.", tags:["gränser"]},
  {id:"g6", category:"Guiden", title:"Trygghetssignaler", ingress:"Så skapar ni trygg ram före, under och efter.", body:"Fulltext placeholder.", tags:["trygghet"]},
  {id:"g7", category:"Guiden", title:"Beröring 101", ingress:"Tempo, tryck och tempo—grunderna.", body:"Fulltext placeholder.", tags:["beröring"]},
  {id:"g8", category:"Guiden", title:"Feedback som hjälper", ingress:"Hur man styr utan att döda stämningen.", body:"Fulltext placeholder.", tags:["feedback"]},
  {id:"g9", category:"Guiden", title:"Vanliga missförstånd", ingress:"Vad som oftast går fel – och hur ni reparerar.", body:"Fulltext placeholder.", tags:["missförstånd"]},
  {id:"g10", category:"Guiden", title:"Efteråt: debrief", ingress:"Prata igenom vad ni gillade och vad ni ändrar.", body:"Fulltext placeholder.", tags:["reflektion"]},
  {id:"e1", category:"Utforska", title:"Stärk självkänslan", ingress:"Övningar för att bli snällare mot dig själv.", body:"Fulltext placeholder.", tags:["självkänsla"]},
  {id:"e2", category:"Utforska", title:"10 frågor som öppnar upp", ingress:"Enkla frågor att börja med.", body:"Fulltext placeholder.", tags:["frågor"]},
  {id:"e3", category:"Utforska", title:"Planera en dejt hemma", ingress:"Låg effort, hög effekt.", body:"Fulltext placeholder.", tags:["dejt"]},
  {id:"e4", category:"Utforska", title:"Sömn & närhet", ingress:"Hur sömn påverkar intimitet.", body:"Fulltext placeholder.", tags:["sömn"]},
  {id:"e5", category:"Utforska", title:"Stress och lust", ingress:"Strategier för att hitta tillbaka.", body:"Fulltext placeholder.", tags:["stress","lust"]},
  {id:"e6", category:"Utforska", title:"Kroppsspråkets signaler", ingress:"Läsa och bli läst.", body:"Fulltext placeholder.", tags:["kroppsspråk"]},
  {id:"e7", category:"Utforska", title:"Micro-vanor i vardagen", ingress:"Små steg som bygger relation.", body:"Fulltext placeholder.", tags:["vanor"]},
  {id:"e8", category:"Utforska", title:"Ritual för närhet", ingress:"Skapa en gemensam rutin.", body:"Fulltext placeholder.", tags:["ritual"]},
  {id:"e9", category:"Utforska", title:"Konflikt till kontakt", ingress:"Vänd friktion till förståelse.", body:"Fulltext placeholder.", tags:["konflikt"]},
  {id:"e10", category:"Utforska", title:"Teknik-detox som par", ingress:"Skärmfri tid, mer närvaro.", body:"Fulltext placeholder.", tags:["digital detox"]}
];

const store = {
  key: 'bn-v02',
  load(){ try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; } },
  save(data){ localStorage.setItem(this.key, JSON.stringify(data)); }
};

function applyThemeFromState(){
  const s = store.load();
  const theme = s.theme || {primary:'#6366F1', secondary:'#06B6D4', accent:'#22C55E'};
  const r = document.documentElement;
  r.style.setProperty('--primary', theme.primary);
  r.style.setProperty('--secondary', theme.secondary);
  r.style.setProperty('--accent', theme.accent);
  const pc = document.getElementById('primaryColor');
  const sc = document.getElementById('secondaryColor');
  const ac = document.getElementById('accentColor');
  if (pc) pc.value = theme.primary;
  if (sc) sc.value = theme.secondary;
  if (ac) ac.value = theme.accent;
}

function saveTheme(){
  const theme = {
    primary: document.getElementById('primaryColor').value,
    secondary: document.getElementById('secondaryColor').value,
    accent: document.getElementById('accentColor').value
  };
  const s = store.load();
  s.theme = theme;
  store.save(s);
}

function renderList(container, list){
  container.innerHTML = '';
  list.forEach((a,i) => {
    const tpl = document.getElementById('card-tpl').content.cloneNode(true);
    const privacy = (document.getElementById('privacyMode')?.checked) || false;
    tpl.querySelector('.title').textContent = privacy ? `Artikel ${i+1}` : a.title;
    tpl.querySelector('.ingress').textContent = privacy ? 'Dolt i integritetsläge' : a.ingress;
    tpl.querySelector('.save').addEventListener('click', () => saveArticle(a));
    tpl.querySelector('.open').addEventListener('click', () => openArticle(a));
    container.appendChild(tpl);
  });
}

function renderFeed(){
  const feedContainer = document.getElementById('cards');
  renderList(feedContainer, articles.filter(a => a.category==='Utforska').slice(0,6));
}
function renderGuide(){ renderList(document.getElementById('guideList'), articles.filter(a => a.category==='Guiden')); }
function renderSaved(){
  const list = document.getElementById('savedList');
  list.innerHTML = '';
  const { saved=[] } = store.load();
  renderList(list, saved);
}
function saveArticle(a){
  const s = store.load();
  s.saved = s.saved || [];
  if (!s.saved.find(x => x.id===a.id)) s.saved.push(a);
  store.save(s);
  renderSaved();
}
function openArticle(a){
  document.getElementById('modalTitle').textContent = a.title;
  document.getElementById('modalIngress').textContent = a.ingress;
  document.getElementById('modalBody').innerHTML = `<p>${a.body}</p>`;
  document.getElementById('modal').showModal();
}
// Fulltextsök
function search(){
  const q = document.getElementById('search').value.trim().toLowerCase();
  const inTitle = a => a.title.toLowerCase().includes(q);
  const inIngress = a => a.ingress.toLowerCase().includes(q);
  const inBody = a => a.body.toLowerCase().includes(q);
  const inTags = a => (a.tags||[]).some(t => t.toLowerCase().includes(q));
  const hits = articles.filter(a => inTitle(a)||inIngress(a)||inBody(a)||inTags(a));
  renderList(document.getElementById('results'), hits);
}
function switchTab(panelId){
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.panel === panelId));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === panelId));
}
function savePrefs(){
  const focus = document.getElementById('focus').value;
  const tone = document.getElementById('tone').value;
  const privacy = (document.getElementById('privacyMode')?.checked) || false;
  const s = store.load();
  s.prefs = { focus, tone, privacy };
  store.save(s);
  const el = document.getElementById('saveStatus');
  el.textContent = "Sparat!";
  setTimeout(() => el.textContent = "", 1500);
  renderFeed(); renderGuide(); renderSaved();
}
function resetDemo(){
  localStorage.removeItem(store.key);
  applyThemeFromState();
  renderFeed(); renderGuide(); renderSaved();
}

document.addEventListener('DOMContentLoaded', () => {
  $$('.tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.panel)));
  document.getElementById('savePrefs').addEventListener('click', savePrefs);
  document.getElementById('privacyMode').addEventListener('change', savePrefs);
  document.getElementById('applyTheme').addEventListener('click', () => { saveTheme(); applyThemeFromState(); });
  document.getElementById('reset').addEventListener('click', resetDemo);
  document.getElementById('closeModal').addEventListener('click', () => document.getElementById('modal').close());
  document.getElementById('doSearch').addEventListener('click', search);
  document.getElementById('search').addEventListener('keydown', e => { if (e.key === 'Enter') search(); });

  applyThemeFromState();
  renderFeed();
  renderGuide();
  renderSaved();
});

