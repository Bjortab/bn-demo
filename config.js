// config.js
// Slå PÅ riktiga API-anrop
window.OFFLINE_MODE = false;

// Lagra nyckeln lokalt (helst via BlushConnect; för snabbtest kan du sätta den här)
window.OPENAI_API_KEY = window.OPENAI_API_KEY || localStorage.getItem('OPENAI_API_KEY') || "";

// Hjälpfunktioner
window.getApiKey   = () => window.OPENAI_API_KEY || localStorage.getItem('OPENAI_API_KEY') || "";
window.setApiKey   = (k) => { localStorage.setItem('OPENAI_API_KEY', k||""); window.OPENAI_API_KEY = k||""; };
window.clearApiKey = ()  => { localStorage.removeItem('OPENAI_API_KEY'); window.OPENAI_API_KEY = ""; };

// Demo-röster (etiketter för listan – mappas till OpenAI TTS-voice nedan)
window.DEMO_VOICES = [
  { id:'alloy',    label:'Alloy (neutral)' },
  { id:'verse',    label:'Verse (mjuk)' },
  { id:'aria',     label:'Aria (kvinna)' },
  { id:'coral',    label:'Coral (man)'   }
];

// Rekommenderat (oförändrat)
window.DEMO_RECS = [
  { id:'r1', title:'Kvällsritual för närhet', ing:'Mjuk landning + varm blickkontakt.' },
  { id:'r2', title:'Kontakt när stressen biter', ing:'Microwinding när nervsystemet är uppe i varv.' },
  { id:'r3', title:'Sensuell guidning', ing:'Långsam rytm med ord som dröjer kvar.' }
];
