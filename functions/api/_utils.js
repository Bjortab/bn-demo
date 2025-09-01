// functions/api/_utils.js

export const corsHeaders = (request) => {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
};

export const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
};

export const badRequest = (message, request) => {
  return jsonResponse({ ok: false, error: message }, 400);
};

export const serverError = (message, request) => {
  return jsonResponse({ ok: false, error: message?.toString?.() || message }, 500);
};

// ✅ Ersätter Node.js crypto med Web Crypto API
export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
