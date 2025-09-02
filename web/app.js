const API = location.origin.replace(/\/+$/, "") + "/api/v1";
const els = {
  status: document.getElementById("status"),
  btnAuth: document.getElementById("btnAuth"),
  balRow: document.getElementById("balRow"),
  authRow: document.getElementById("authRow"),
  balance: document.getElementById("balance"),
  holds: document.getElementById("holds"),
  btnRefresh: document.getElementById("btnRefresh"),
  btnTopup: document.getElementById("btnTopup"),
  prompt: document.getElementById("prompt"),
  level: document.getElementById("level"),
  levelVal: document.getElementById("levelVal"),
  voice: document.getElementById("voice"),
  tts: document.getElementById("tts"),
  character: document.getElementById("character"),
  btnSaveChar: document.getElementById("btnSaveChar"),
  quoteBox: document.getElementById("quoteBox"),
  btnQuote: document.getElementById("btnQuote"),
  btnGenerate: document.getElementById("btnGenerate"),
  result: document.getElementById("result"),
  player: document.getElementById("player"),
  chars: document.getElementById("chars"),
  eps: document.getElementById("eps"),
};

let session = {
  token: localStorage.getItem("bn_token") || null,
  user_id: localStorage.getItem("bn_uid") || null,
  lastQuote: null,
  lastHold: null
};
updateUI();

els.level.addEventListener("input", () => els.levelVal.textContent = els.level.value);

els.btnAuth.addEventListener("click", async () => {
  const r = await fetch(API + "/auth/anonymous", { method:"POST" });
  const j = await r.json();
  if (j.user_id && j.token) {
    session.user_id = j.user_id; session.token = j.token;
    localStorage.setItem("bn_token", session.token);
    localStorage.setItem("bn_uid", session.user_id);
    await refreshBal();
    await refreshChars();
    await refreshEps();
    updateUI();
  } else alert("Kunde inte skapa session.");
});

els.btnRefresh.addEventListener("click", refreshBal);
els.btnTopup.addEventListener("click", async () => {
  // Demo: direkt webhook-stub
  const r = await fetch(API + "/payments/ccbill/webhook", {
    method:"POST",
    headers: authJson(),
    body: JSON.stringify({ user_id: session.user_id })
  });
  if (r.ok) {
    await refreshBal();
    alert("Saldo +500 (demo)");
  } else {
    alert("Top-up misslyckades");
  }
});

els.btnSaveChar.addEventListener("click", async () => {
  const display_name = prompt("Namn på karaktären (t.ex. Heta grannen):");
  if (!display_name) return;
  const body = {
    display_name,
    archetype_key: detectArch(els.prompt.value || ""),
    traits: {},
    voice_preset: els.voice.value
  };
  const r = await fetch(API + "/characters", {
    method:"POST",
    headers: authJson(),
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (j.character_id) {
    await refreshChars();
    alert("Karaktär sparad.");
  } else {
    alert("Kunde inte spara karaktär.");
  }
});

els.btnQuote.addEventListener("click", async () => {
  const body = buildQuoteBody();
  const r = await fetch(API + "/credits/quote", {
    method:"POST",
    headers: authJson(),
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (j.error) { showErr(j.error); return; }
  session.lastQuote = j;
  els.quoteBox.textContent = `Kostnad ≈ ${j.total_credits} credits (${j.notes})`;
  els.btnGenerate.disabled = false;
});

els.btnGenerate.addEventListener("click", async () => {
  if (!session.lastQuote) return alert("Beräkna kostnad först.");
  // Hold
  const hr = await fetch(API + "/credits/hold", {
    method:"POST",
    headers: authJson(),
    body: JSON.stringify({ quote_id: session.lastQuote.quote_id })
  });
  const h = await hr.json();
  if (h.error) { showErr(h.error); return; }
  session.lastHold = h;

  // Generate
  const idem = crypto.randomUUID();
  const body = {
    quote_id: session.lastQuote.quote_id,
    hold_id: session.lastHold.hold_id,
    character_id: els.character.value || null
  };
  const r = await fetch(API + "/generate", {
    method:"POST",
    headers: { ...authJson(), "X-Idempotency-Key": idem },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (j.error) { showErr(j.error); return; }
  if (j.status === "DONE") {
    els.result.textContent = "";
    // Hämta text (proxy: i demo är r2:// – visa direkt text från serverns TLDR + info)
    els.result.textContent = `TL;DR: ${j.episode.tldr}\n\n(Fulltext sparad i R2: ${j.episode.text_url})\n\nProvider: ${j.provider}\nCredits: ${j.cost.credits}`;
    if (j.episode.audio_url) {
      els.player.src = j.episode.audio_url;
      els.player.classList.remove("hide");
    } else {
      els.player.classList.add("hide");
    }
    await refreshBal();
    await refreshEps();
  } else {
    alert("Jobbstatus: " + j.status);
  }
});

async function refreshBal() {
  if (!session.token) return;
  const r = await fetch(API + "/credits/balance", { headers: authOnly() });
  const j = await r.json();
  if (j.error) return;
  els.balance.textContent = j.balance;
  els.holds.textContent = j.holds;
}

async function refreshChars() {
  if (!session.token) return;
  const r = await fetch(API + "/characters", { headers: authOnly() });
  const j = await r.json();
  const list = j.items || [];
  els.character.innerHTML = `<option value="">(ingen)</option>` + list.map(c => `<option value="${c.id}">${c.display_name}</option>`).join("");
  els.chars.innerHTML = list.map(c => `<li><strong>${c.display_name}</strong> <small>${c.archetype_key || ""}</small></li>`).join("");
}

async function refreshEps() {
  if (!session.token) return;
  const r = await fetch(API + "/episodes", { headers: authOnly() });
  const j = await r.json();
  const list = j.items || [];
  els.eps.innerHTML = list.map(e => `<li>#${e.episode_no} – nivå ${e.level} – ${new Date(e.created_at).toLocaleString()}<br><em>${e.tldr}</em></li>`).join("");
}

function updateUI() {
  if (session.token) {
    els.authRow.classList.add("hide");
    els.balRow.classList.remove("hide");
    setStatus();
  } else {
    els.authRow.classList.remove("hide");
    els.balRow.classList.add("hide");
  }
}
async function setStatus() {
  const r = await fetch(API + "/status");
  const j = await r.json();
  els.status.textContent = `v${j.version} — mock:${j.mock ? "på" : "av"}`;
}

function buildQuoteBody() {
  const level = parseInt(els.level.value, 10);
  const lang = "sv";
  const voice_preset = els.voice.value;
  const tts = els.tts.checked ? { enabled: true, tier: voice_preset.startsWith("elevenlabs:") ? "EL" : "BASIC" } : { enabled:false };
  const mode = els.character.value ? "CONTINUE" : "NEW";
  return {
    mode, level, lang, voice_preset,
    words_target: 800,
    tts,
    character_id: els.character.value || null,
    prompt: els.prompt.value || "romantisk kväll"
  };
}

function detectArch(p) {
  const s = (p || "").toLowerCase();
  if (s.includes("granne")) return "heta_grannen";
  if (s.includes("chef")) return "chef";
  if (s.includes("hotel")) return "hotellet";
  if (s.includes("pt") || s.includes("personlig tränare")) return "pt";
  return "fri_fantasi";
}

function authOnly() {
  return { "Authorization": `Bearer ${session.token}` };
}
function authJson() {
  return { ...authOnly(), "Content-Type": "application/json" };
}
function showErr(e) {
  alert(`${e.code}: ${e.message}`);
}
