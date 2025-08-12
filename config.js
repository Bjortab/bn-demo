// Konfig och demo-data som är enkla att byta utan att röra app-logik

// Kategorichips (snabbfilter för flödet)
window.BN_CHIPS = [
  { id:'romantik',  label:'Romantik' },
  { id:'lekfullt',  label:'Lekfullt' },
  { id:'sensuellt', label:'Sensuellt' },
  { id:'återkoppling', label:'Eftervård' }
];

// Demo-berättelser (kan senare ersättas av API)
window.BN_STORIES = [
  {id:"a1", lvl:[1,3], cats:['romantik'], title:"Kvällsritual för närhet", ingress:"10 min mjuk landning + varm blickkontakt.", body:"Sänk tempot. Hand över hjärtat, tre djupa andetag i takt. Sitt nära. Säg vad du längtar efter ikväll."},
  {id:"a2", lvl:[1,3,5], cats:['lekfullt','sensuellt'], title:"Hemma-dejt: enkel", ingress:"Musik, ljus, tre lekfulla moment.", body:"Byt miljö hemma. Välj lista. Tre moment: långsam beröring, ögonkontakt i 30 sek, eftervård."},
  {id:"a3", lvl:[3,5], cats:['sensuellt'], title:"Kontakt när stressen biter", ingress:"Microövning när nervsystemet är uppe i varv.", body:"Lång utandning, skaka loss 30 sek, varm hand där det känns. Säg: 'jag är här'."},
  {id:"a4", lvl:[5], cats:['sensuellt','återkoppling'], title:"Sensuell guidning", ingress:"Långsam rytm, styr med ord.", body:"Lyssna på kroppen. Stanna. Be om mer eller mindre. Avsluta med eftervård och vatten."}
];

// Demo-profiler (lokalt, för Connect-lista)
window.BN_PEOPLE = [
  {alias:'Lumi', level:1, pref:'romantik',  about:'Gillar mjuka upplägg, varma röster och långsam rytm.'},
  {alias:'Noah', level:3, pref:'lekfullt',  about:'Nyfiken på lek och skratt — men med tydliga ramar.'},
  {alias:'Iris', level:5, pref:'sensuellt', about:'Tycker om explicit språk och långsamma instruktioner.'},
  {alias:'Mika', level:3, pref:'romantik',  about:'Mellanläge, samtal före allt. Letar tryggt tempo.'}
];
