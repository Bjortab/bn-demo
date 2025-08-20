// ====== DEMO-KONFIG ======
window.OFFLINE_MODE = true; // Byt till false när du vill använda OpenAI på riktigt

// Röstlista (demo). Om OFFLINE_MODE=false kan denna fyllas med riktiga röster.
window.DEMO_VOICES = [
  { id:'auto',      label:'Auto (sv-SE om möjligt)' },
  { id:'soft-f',    label:'Mjuk (kvinna, demo)' },
  { id:'warm-m',    label:'Varm (man, demo)' },
  { id:'neutral',   label:'Neutral (demo)' }
];

// Kort rekommenderat-lista (demo)
window.DEMO_RECS = [
  { id:'r1', title:'Kvällsritual för närhet', ing:'Mjuk landning + varm blickkontakt.', level:1, tag:'romantisk' },
  { id:'r2', title:'Kontakt när stressen biter', ing:'Microwinding när nervsystemet är uppe i varv.', level:2, tag:'sensuell' },
  { id:'r3', title:'Sensuell guidning', ing:'Långsam rytm, ord med omsorg.', level:3, tag:'sensuell' }
];

// Hjälp: spara/hämta API-nyckel lokalt
window.getApiKey = () => localStorage.getItem('OPENAI_API_KEY') || '';
window.setApiKey = (k) => localStorage.setItem('OPENAI_API_KEY', k || '');
window.clearApiKey = () => localStorage.removeItem('OPENAI_API_KEY');
