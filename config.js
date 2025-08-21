// OFFLINE-säkert läge. Låt denna vara true tills du vill testa API på riktigt.
window.OFFLINE_MODE = true;

// Demo-röster (etiketter). Vid OFFLINE_MODE=false kan du byta mot riktiga.
window.DEMO_VOICES = [
  { id:'auto',    label:'Auto (sv-SE om möjligt)' },
  { id:'soft-f',  label:'Mjuk (kvinna, demo)' },
  { id:'warm-m',  label:'Varm (man, demo)' },
  { id:'neutral', label:'Neutral (demo)' }
];

// Demo-rekommendationer
window.DEMO_RECS = [
  { id:'r1', title:'Kvällsritual för närhet', ing:'Mjuk landning + varm blickkontakt.' },
  { id:'r2', title:'Kontakt när stressen biter', ing:'Microwinding när nervsystemet är uppe i varv.' },
  { id:'r3', title:'Sensuell guidning', ing:'Långsam rytm, ord med omsorg.' }
];

// Lokal lagring av ev. API-nyckel (används först när OFFLINE_MODE=false)
window.getApiKey = () => localStorage.getItem('OPENAI_API_KEY') || '';
window.setApiKey = (k) => localStorage.setItem('OPENAI_API_KEY', k||'');
window.clearApiKey = () => localStorage.removeItem('OPENAI_API_KEY');
