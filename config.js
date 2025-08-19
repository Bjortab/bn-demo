// === OpenAI TTS (riktiga röster) ===
// Fyll i din API-nyckel för att använda OpenAI TTS. Lämna tom för fallback (Web Speech).
window.OPENAI_API_KEY   = ""; // <-- sätt "sk-..." här för demo (lägg inte publikt i längden)
window.OPENAI_TTS_MODEL = "gpt-4o-mini-tts"; // modellnamn för TTS
// Tillgängliga röster (exempel): alloy, verse, luna, coral, sage
window.OPENAI_VOICES    = ["alloy","verse","luna"];

// “Live-rå” nivå 5 i demon (utan grafiska ord)
window.RAW_MODE_LIVE = true;

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
