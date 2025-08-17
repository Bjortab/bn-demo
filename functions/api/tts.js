// /functions/api/tts.js
// POST { text, voice="verse", speed=1.0 } => { ok, audio: "data:audio/mpeg;base64,...", cached?: "r2"|"kv"|"miss" }

export const onRequestPost = async ({ request, env }) => {
  try {
    const { text, voice="verse", speed=1.0 } = await request.json();

    const clean = s => (typeof s === "string" ? s.trim() : "");
    const _text = clean(text);
    if (!_text) return json({ ok:false, error:"empty_text" }, 400);

    const _voice = clean(voice) || "verse";
    const _speed = Math.max(0.5, Math.min(2.0, Number(speed)||1.0));

    // 1) cache-nyckel
    const key = await sha256Base32(`${_voice}|${_speed}|${_text}`);
    const r2Path = `audios/${key}.mp3`;

    // 2) R2
    if (env.AUDIO_BUCKET) {
      const obj = await env.AUDIO_BUCKET.get(r2Path);
      if (obj) {
        const buf = await obj.arrayBuffer();
        const b64 = toBase64(buf);
        return json({ ok:true, audio:`data:audio/mpeg;base64,${b64}`, cached:"r2" });
      }
    }

    // 3) KV
    if (env.AUDIO_KV) {
      const b64 = await env.AUDIO_KV.get(key);
      if (b64) return json({ ok:true, audio:`data:audio/mpeg;base64,${b64}`, cached:"kv" });
    }

    // 4) Generera via OpenAI
    const OPENAI = env.OPENAI_API_KEY || env.OPENAI_KEY;
    if (!OPENAI) return json({ ok:false, error:"missing_openai_key" }, 500);

    const prepared = smartPace(_text); // lägg små pauser för bättre flyt
    const mp3Buf = await openaiTTS(OPENAI, prepared, _voice, _speed);

    // 5) Spara cache
    if (env.AUDIO_BUCKET) {
      await env.AUDIO_BUCKET.put(r2Path, mp3Buf, {
        httpMetadata:{ contentType:"audio/mpeg" },
        customMetadata:{ voice:_voice, speed:String(_speed) }
      });
    } else if (env.AUDIO_KV) {
      const b64 = toBase64(mp3Buf);
      await env.AUDIO_KV.put(key, b64, { expirationTtl: 60*60*24*90 }); // 90 dagar
    }

    // 6) Returnera
    const b64 = toBase64(mp3Buf);
    return json({ ok:true, audio:`data:audio/mpeg;base64,${b64}`, cached:"miss" });

  } catch (err) {
    return json({ ok:false, error:"server_error", detail:String(err?.message||err) }, 500);
  }
};

/* === Helpers === */
const json = (obj, status=200) =>
  new Response(JSON.stringify(obj), { status, headers:{ "content-type":"application/json; charset=utf-8", "cache-control":"no-store" } });

function toBase64(ab){
  const bytes = new Uint8Array(ab); let binary="";
  for (let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// injicera små pauser → bättre prosodi
function smartPace(s){
  return s
    .replace(/\n{2,}/g, "\n\n<break time=\"350ms\"/>\n\n")
    .replace(/([.!?])(\s)/g, "$1<break time=\"180ms\"/>$2");
}

// Base32-hash för stabila filnamn
async function sha256Base32(s){
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits=0, value=0, out="";
  for (let i=0;i<bytes.length;i++){
    value = (value<<8) | bytes[i]; bits += 8;
    while(bits>=5){ out += alphabet[(value >>> (bits-5)) & 31]; bits -= 5; }
  }
  if (bits>0) out += alphabet[(value << (5-bits)) & 31];
  return out;
}

// OpenAI TTS → mp3 ArrayBuffer
async function openaiTTS(API_KEY, text, voice, speed){
  const payload = {
    model: "gpt-4o-mini-tts",
    voice: voice || "verse",
    input: text,
    speed: Math.max(0.5, Math.min(2.0, Number(speed)||1.0)),
    format: "mp3"
  };
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method:"POST",
    headers:{ "authorization":`Bearer ${API_KEY}`, "content-type":"application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok){
    let err=""; try{ err = await res.text(); }catch{}
    throw new Error(`openai_tts_${res.status}: ${err}`);
  }
  return res.arrayBuffer();
}
