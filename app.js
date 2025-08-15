 List.toggle('hidden', !logged);
    if (logged){ els.meMail.textContent = u.email; els.subName.textContent = u.plan || 'Gratis'; renderFavs(); }
  }
  function renderFavs(){
    const list = store.favs;
    const html = list.length ? list.map(x=>`
      <div class="card">
        <h4>${x.title}</h4>
        <div class="mini">Nivå ${x.spice} · ${x.mins} min</div>
        <button class="primary" data-replay="${x.id}">Spela</button>
      </div>
    `).join('') : `<div class="mini">Inga favoriter ännu.</div>`;
    const favs = document.getElementById('favs'); if (favs) favs.innerHTML = html;
    document.querySelectorAll('[data-replay]').forEach(b=>{
      b.onclick = ()=>{
        const it = store.favs.find(f=>f.id===b.dataset.replay);
        els.length.value = it.mins; updateWords();
        els.spice.value = it.spice; renderSpice();
        els.prompt.value = it.idea;
        show('compose');
      };
    });
  }
  refreshConnect();

  els.btnRegister.onclick = ()=>{
    const email = (els.email.value||'').trim();
    const pw = (els.pw.value||'').trim();
    if(!email || !pw) return alert('Fyll i e-post och lösenord.');
    store.user = { email, plan:'Gratis' };
    refreshConnect(); show('connect');
  };
  els.btnLogin.onclick = ()=>{
    const email = (els.email.value||'').trim();
    if(!email) return alert('Fyll i e-post.');
    store.user = { email, plan: store.user?.plan || 'Gratis' };
    refreshConnect();
  };
  els.btnLogout.onclick = ()=>{ localStorage.removeItem('bn_user'); refreshConnect(); };
  els.btnManage.onclick = ()=> alert('Betalning med kort kopplas här (CCBill/SegPay).');

  // Bibliotek – fylls i nästa batch (snabbknappar kan skapas här)

  // Generering
  let last = { idea:"", mins:0, spice:0, text:"" };

  async function doGenerate({forTTS=false} = {}){
    if(!requireAge()){ uiStatus('Bekräfta 18+ under Hem.', 'err'); return null; }
    const idea  = (els.prompt.value||"").trim();
    const mins  = Number(els.length.value||5);
    const spice = Number(els.spice.value||2);
    const voice = els.voice.value || "verse";
    if(!idea){ uiStatus('Skriv en idé först.', 'err'); return null; }

    const onlySpiceChanged = last.text && idea===last.idea && mins===last.mins && spice!==last.spice;
    const payload = onlySpiceChanged
      ? { reuseText:true, baseText:last.text, mins, spice, voice }
      : { idea, mins, spice, voice };

    uiStatus(onlySpiceChanged ? 'Kryddar befintlig berättelse…' : 'Genererar text…');
    const data = await api("generate", payload);
    if(!data?.text){ uiStatus('Tomt svar från generate.', 'err'); return null; }

    last = { idea, mins, spice, text:data.text };
    els.excerpt.textContent = data.excerpt || (data.text.slice(0, 500)+" …");
    uiStatus('Text klar.', 'ok');
    return data.text;
  }

  async function doRead(){
    try{
      const text = await doGenerate({ forTTS:true });
      if (!text) return;
      uiStatus('Skapar röst…');
      const blob = await api("tts", { text: last.text, voice: els.voice.value || "verse" }, true);
      const url = URL.createObjectURL(blob);
      els.player.src = url;
      els.player.play().catch(()=>{});
      uiStatus('Klar att spela upp.', 'ok');
    }catch(err){
      console.error(err);
      uiStatus('Generate failed: '+err.message, 'err');
    }
  }

  els.btnPreview.onclick = () => { doGenerate(); };
  els.btnRead.onclick    = () => { doRead(); };
  els.btnFav.onclick     = () => {
    const idea  = (els.prompt.value||'').trim();
    if(!idea) return alert('Skriv en idé först.');
    const item = { id:'fav_'+Date.now(), title:(idea.length>24? idea.slice(0,24)+'…' : idea),
      idea, mins:Number(els.length.value), spice:Number(els.spice.value) };
    const favs = store.favs; favs.unshift(item); store.favs = favs.slice(0,100);
    renderFavs(); alert('Sparad i favoriter.');
  };
});
