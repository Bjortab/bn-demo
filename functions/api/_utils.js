// functions/api/_utils.js
export function corsHeaders(request, extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "cache-control": "no-store",
    ...extra,
  };
}

export function jsonResponse(payload, status = 200, request) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(request) },
  });
}

export function serverError(err, request) {
  return jsonResponse(
    { ok: false, error: String(err?.message || err), stack: undefined },
    500,
    request
  );
}

export async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ———— Input-skydd ———— //
const CELEBS = ["zlatan","madonna","prinsessan madeleine","taylor swift","elon musk"];
const FORBIDDEN_REL = ["svärmor","svärfar","pappa","mamma","son","dotter","morbror","farbror","bror","syster","moster","faster","kusin"];

export function sanitizeIdea(ideaRaw) {
  const idea = String(ideaRaw || "").trim();
  if (!idea) return { ok: false, error: "Tom idé." };
  const low = idea.toLowerCase();

  for (const w of FORBIDDEN_REL) if (low.includes(w))
    return { ok:false, error:"Förbjudna familjerelationer är ej tillåtna. Använd neutrala roller (t.ex. 'äldre bekant', 'grannfrun')." };

  for (const c of CELEBS) if (low.includes(c))
    return { ok:false, error:"Kändisnamn ej tillåtna. Använd förnamn eller roll (grannfrun, kollegan, tränaren)." };

  if (/\b[A-ZÅÄÖ][a-zåäö]+(?:\s+[A-ZÅÄÖ][a-zåäö]+){1,}\b/.test(idea))
    return { ok:false, error:"Fullständiga namn ej tillåtna. Använd endast förnamn eller en roll." };

  return { ok: true, idea };
}

export function normalizeFirstName(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  const parts = s.split(/\s+/);
  return parts[0];
}
