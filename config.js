// Demo-flagga: styr hur “rå” nivå 5 får vara.
// I demot håller vi språket icke-grafiskt. När ni kopplar backend för live
// kan ni sätta RAW_MODE_LIVE=true och generera från server.
window.RAW_MODE_LIVE = true; // <- du bad om "så rå som live": här tillåter vi mer direkt ton (men ej grafiska ord i demot).

// Chips
window.BN_CHIPS = [
  { id:'romantik',  label:'Romantik' },
  { id:'lekfullt',  label:'Lekfullt' },
  { id:'sensuellt', label:'Sensuellt' },
  { id:'återkoppling', label:'Eftervård' }
];

// Stories (kompakta kort i flödet)
window.BN_STORIES = [
  {id:"a1", lvl:[1,2,3],       cats:['romantik'], title:"Kvällsritual för närhet", ingress:"10 min mjuk landning + varm blickkontakt.", body:"Sänk tempot. Hand över hjärtat, tre djupa andetag i takt. Sitt nära. Säg vad du längtar efter ikväll."},
  {id:"a2", lvl:[2,3,4,5],     cats:['lekfullt','sensuellt'], title:"Hemma-dejt: enkel", ingress:"Musik, ljus, tre lekfulla moment.", body:"Byt miljö hemma. Tre moment: långsam beröring, ögonkontakt i 30 sek, eftervård."},
  {id:"a3", lvl:[1,2,3,4],     cats:['sensuellt'], title:"Kontakt när stressen biter", ingress:"Microövning när nervsystemet är uppe i varv.", body:"Lång utandning, skaka loss 30 sek, varm hand där det känns. Säg: 'jag är här'."},
  {id:"a4", lvl:[3,4,5],       cats:['sensuellt','återkoppling'], title:"Sensuell guidning", ingress:"Långsam rytm, styr med ord.", body:"Lyssna på kroppen. Be om mer eller mindre. Avsluta med eftervård och vatten."}
];

// People (demo)
window.BN_PEOPLE = [
  {alias:'Lumi', level:1, pref:'romantik',  about:'Gillar mjuka upplägg och långsam rytm.'},
  {alias:'Noah', level:3, pref:'lekfullt',  about:'Nyfiken på lek och skratt — med ramar.'},
  {alias:'Iris', level:5, pref:'sensuellt', about:'Gillar direkt språk och varm intensitet.'},
  {alias:'Mika', level:4, pref:'romantik',  about:'Vill ha mellan–hög intensitet med tryggt tempo.'}
];
