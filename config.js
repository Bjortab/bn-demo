// Kör offline (ingen API krävs). När du vill testa riktiga röster: sätt false.
window.OFFLINE_MODE = true;

// Demo-röster (etiketter).
window.DEMO_VOICES = [
  { id:'auto',    label:'Auto (sv-SE om möjligt)' },
  { id:'soft-f',  label:'Mjuk • kvinna (demo)' },
  { id:'warm-m',  label:'Varm • man (demo)' },
  { id:'neutral', label:'Neutral (demo)' },
  { id:'whisper', label:'Viskande (demo)' }
];

// Demo-rekommenderat
window.DEMO_RECS = [
  { id:'r1', title:'Kvällsritual för närhet', ing:'Mjuk landning + varm blickkontakt.' },
  { id:'r2', title:'Kontakt när stressen biter', ing:'Microwinding när nervsystemet är uppe i varv.' },
  { id:'r3', title:'Sensuell guidning', ing:'Långsam rytm med ord som dröjer kvar.' }
];

// Lokal API-nyckel (för när OFFLINE_MODE=false)
window.getApiKey  = () => localStorage.getItem('OPENAI_API_KEY') || '';
window.setApiKey  = (k) => localStorage.setItem('OPENAI_API_KEY', k||'');
window.clearApiKey= () => localStorage.removeItem('OPENAI_API_KEY');
