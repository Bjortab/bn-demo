const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

// Artiklar (placeholder – fylls på i v0.3)
const articles = [
  {id:"g1", category:"Guiden", title:"Kommunikation som faktiskt funkar", ingress:"En enkel modell för svåra samtal: spegla, validera, önska.", body:"Fulltext placeholder.", tags:["kommunikation","relation"]},
  {id:"e1", category:"Utforska", title:"Stärk självkänslan", ingress:"Övningar för att bli snällare mot dig själv.", body:"Fulltext placeholder.", tags:["självkänsla"]},
  {id:"e2", category:"Utforska", title:"10 frågor som öppnar upp", ingress:"Enkla frågor att börja med.", body:"Fulltext placeholder.", tags:["frågor"]},
  {id:"e3", category:"Utforska", title:"Planera en dejt hemma", ingress:"Låg effort, hög effekt.", body:"Fulltext placeholder.", tags:["dejt"]},
  {id:"e4", category:"Utforska", title:"Sömn & närhet", ingress:"Hur sömn påverkar intimitet.", body:"Fulltext placeholder.", tags:["sömn"]},
  {id:"e5", category:"Utforska", title:"Stress och lust", ingress:"Strategier för att hitta tillbaka.", body:"Fulltext placeholder.", tags:["stress","lust"]},
  {id:"e6", category:"Utforska", title:"Kroppsspråkets signaler", ingress:"Läsa och bli läst.", body:"Fulltext placeholder.", tags:["kroppsspråk"]}
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
  const pc = $('#primaryColor'), sc = $('#secondaryColor'), ac = $('#accentColor');
  if (pc) pc.value = theme.primary; if (sc) sc.value = theme.secondary; if (ac) ac.value = theme.accent;
}
function saveTheme(){
  const theme = { primary: $('#primaryColor').value, secondary: $('#secondaryColor').value, accent: $('#accentColor').value };
  const s = store.load(); s.theme = theme; store.save(s);
}

function renderList(container, list){
  container.innerHTML = '';
  list.forEach((a,i) => {
    const tpl = $('#card-tpl').content.cloneNode(true);
    const privacy = $('#privacyMode')?.checked || false;
    tpl.querySelector('.title').textContent = privacy ? `Artikel ${i+1}` : a.title;
    tpl.querySelector('.ingress').textContent = privacy ? 'Dolt i integritetsläge' : a.ingress;
    tpl.querySelector('.save').addEventListener('click', () => saveArticle(a));
    tpl.querySelector('.open').addEventListener('click', () => openArticle(a));
    container.appendChild(tpl);
  });
}
function renderFeed(){ renderList($('#cards'), articles.filter(a=>a.category!=='Guiden')); }
function renderSaved(){
  const { saved=[] } = store.load();
  renderList($('#savedList'), saved);
}
function saveArticle(a){
  const s = store.load(); s.saved = s.saved || [];
  if (!s.saved.find(x=>x.id===a.id)) s.saved.push(a);
  store.save(s); renderSaved();
}
function openArticle(a){
  $('#modalTitle').textContent = a.title;
  $('#modalIngress').textContent = a.ingress;
  $('#modalBody').innerHTML = `<p>${a.body}</p>`;
  $('#modal').showModal();
}

// Sök
function search(){
  const q = $('#search').value.trim().toLowerCase();
  const hit = a =>
    a.title.toLowerCase().includes(q) ||
    a.ingress.toLowerCase().includes(q) ||
    a.body.toLowerCase().includes(q) ||
    (a.tags||[]).some(t=>t.toLowerCase().includes(q));
  renderList($('#results'), articles.filter(hit));
}

// Tabs
function switchTab(panelId){
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.panel===panelId));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id===panelId));
}

// Prefs
function savePrefs(){
  const s = store.load();
  s.prefs = { focus: $('#focus').value, tone: $('#tone').value, privacy: $('#privacyMode')?.checked || false };
  store.save(s);
  const el = $('#saveStatus'); el.textContent = 'Sparat!'; setTimeout(()=> el.textContent='', 1200);
  renderFeed(); renderSaved();
}
function resetDemo(){ localStorage.removeItem(store.key); applyThemeFromState(); renderFeed(); renderSaved(); }

// Init
document.addEventListener('DOMContentLoaded', () => {
  $$('.tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.panel)));
  $('#savePrefs').addEventListener('click', savePrefs);
  $('#privacyMode').addEventListener('change', savePrefs);
  $('#applyTheme').addEventListener('click', () => { saveTheme(); applyThemeFromState(); });
  $('#reset').addEventListener('click', resetDemo);
  $('#closeModal').addEventListener('click', ()=> $('#modal').close());
  $('#doSearch').addEventListener('click', search);
  $('#search').addEventListener('keydown', e => { if(e.key==='Enter') search(); });

  applyThemeFromState();
  renderFeed();
  renderSaved();
});
